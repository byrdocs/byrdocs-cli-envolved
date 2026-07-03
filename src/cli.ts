#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { authCommand } from "./auth.js";
import { defaultRuntime, type Runtime } from "./config.js";
import { doctorCommand } from "./doctor.js";
import { downloadCommand } from "./download.js";
import { metaCommand } from "./meta.js";
import { fail, humanText, ok, toJsonEnvelope, type CliResult } from "./output.js";
import { searchCommand } from "./search.js";
import { uploadCommand } from "./upload.js";

export async function run(argv = process.argv.slice(2), runtime: Runtime = defaultRuntime()): Promise<number> {
  const { json, help, args } = extractGlobalFlags(argv, runtime.env);
  const result = await Promise.resolve(help ? helpCommand(args) : dispatch(runtime, args)).catch((error: unknown) =>
    fail("unknown", "UNKNOWN_ERROR", "命令执行失败。", { details: error instanceof Error ? error.message : String(error) })
  );
  writeResult(runtime, result, json);
  return result.exitCode;
}

async function dispatch(runtime: Runtime, args: string[]): Promise<CliResult> {
  const command = args[0];
  if (!command || command === "help") return helpCommand(args.slice(1));
  if (command === "doctor") return doctorCommand(runtime);
  if (command === "auth") return authCommand(runtime, args.slice(1));
  if (command === "upload") return uploadCommand(runtime, args.slice(1));
  if (command === "download") return downloadCommand(runtime, args.slice(1));
  if (command === "meta") return metaCommand(runtime, args.slice(1));
  if (command === "search") return searchCommand(runtime, args.slice(1));
  return fail(command, "INVALID_ARGUMENT", "未知命令。");
}

function extractGlobalFlags(argv: string[], env: NodeJS.ProcessEnv): { json: boolean; help: boolean; args: string[] } {
  let json = false;
  let help = false;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") {
      json = true;
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      help = true;
    } else if (argv[i] === "--api-base" && argv[i + 1]) {
      env.BYRDOCS_API_BASE = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--search-url" && argv[i + 1]) {
      env.BYRDOCS_SEARCH_URL = argv[i + 1];
      i += 1;
    } else {
      args.push(argv[i]);
    }
  }
  return { json, help, args };
}

function helpCommand(args: string[]): CliResult {
  const topic = args[0] ?? "byrdocs";
  const help = HELP[topic] ?? HELP.byrdocs;
  return ok(
    "help",
    {
      topic: help.topic,
      description: help.description,
      usage: help.usage,
      commands: help.commands ?? [],
      options: help.options ?? [],
      text: help.text
    },
    help.text
  );
}

function writeResult(runtime: Runtime, result: CliResult, json: boolean): void {
  if (json) {
    runtime.stdout.write(`${JSON.stringify(toJsonEnvelope(result))}\n`);
  } else {
    runtime.stdout.write(`${humanText(result)}\n`);
  }
}

const HELP: Record<
  string,
  {
    topic: string;
    description: string;
    usage: string;
    commands?: string[];
    options?: string[];
    text: string;
  }
> = {
  byrdocs: {
    topic: "byrdocs",
    description: "BYRDocs Agent CLI，用于登录、上传、下载、metadata 和搜索等确定性操作。",
    usage: "byrdocs <command> [args] [--json]",
    commands: [
      "doctor",
      "auth login|wait|status|logout",
      "upload <file>",
      "download <file-ref> --output <path>",
      "meta schema|init|validate|preview",
      "search <query>",
      "help [command]"
    ],
    options: ["--json", "--help, -h", "--api-base <url>", "--search-url <url>"],
    text: `用法：byrdocs <command> [args] [--json]

命令：
  doctor                              检查本地环境和 BYRDocs 服务连通性
  auth login                          创建登录会话
  auth wait <session-id>              等待网页登录完成并保存 token
  auth status                         查看本地登录状态
  auth logout                         删除本地 token 和登录会话
  upload <file.pdf|file.zip>          上传文件
  download <file-ref> --output <path> 下载文件到本地路径
  meta schema [--type book|doc|test]  查看 metadata schema 摘要
  meta init <file-ref> --type <type> --out <path>
                                      生成 metadata YAML 模板
  meta validate <yaml>                校验 metadata YAML
  meta preview <yaml>                 预览 metadata 展示摘要
  search <query> [--limit n] [--type type]
                                      搜索 BYRDocs
  help [command]                      显示帮助

全局参数：
  --json              stdout 只输出一个 JSON object
  --help, -h          显示帮助
  --api-base <url>    覆盖主站 API 地址
  --search-url <url>  覆盖搜索 API 地址`
  },
  auth: {
    topic: "auth",
    description: "管理 BYRDocs 登录会话和本地 token。",
    usage: "byrdocs auth <login|wait|status|logout> [--json]",
    options: ["auth wait <session-id> [--timeout-seconds n] [--interval-ms n]"],
    text: `用法：byrdocs auth <login|wait|status|logout> [--json]

子命令：
  auth login                    创建登录会话并返回浏览器登录链接
  auth wait <session-id>        轮询登录结果并保存 token
  auth status                   查看本地 JWT claims 推断出的登录状态
  auth logout                   删除本地 token 和登录会话

参数：
  auth wait --timeout-seconds n 等待超时秒数，默认 180
  auth wait --interval-ms n     轮询间隔毫秒，默认 2000`
  },
  upload: {
    topic: "upload",
    description: "上传 pdf 或 zip 文件到 BYRDocs，并返回 md5、key 和文件 URL。",
    usage: "byrdocs upload <file.pdf|file.zip> [--chunk-size bytes] [--json]",
    options: ["--chunk-size <bytes>"],
    text: `用法：byrdocs upload <file.pdf|file.zip> [--chunk-size bytes] [--json]

只支持 pdf 和 zip。CLI 会计算 MD5，生成 <md5>.<ext>，再调用主站分片上传接口。`
  },
  download: {
    topic: "download",
    description: "使用 BYRDocs token 下载文件到本地路径。",
    usage: "byrdocs download <file-ref> --output <path> [--json]",
    options: ["--output <path>"],
    text: `用法：byrdocs download <file-ref> --output <path> [--json]

file-ref 支持 32 位 md5、<md5>.pdf|zip、https://byrdocs.org/files/<key>。下载不会写 stdout。`
  },
  meta: {
    topic: "meta",
    description: "生成、校验和预览 BYRDocs metadata YAML。",
    usage: "byrdocs meta <schema|init|validate|preview> [args] [--json]",
    options: ["schema --type <book|doc|test>", "init <file-ref> --type <type> --out <path>"],
    text: `用法：byrdocs meta <schema|init|validate|preview> [args] [--json]

子命令：
  meta schema [--type book|doc|test]       查看 metadata schema（远程优先，本地兜底）
  meta init <file-ref> --type <type> --out <path>
                                           生成 YAML 模板
  meta validate <yaml>                     校验 YAML
  meta preview <yaml>                      输出展示摘要和 ready_for_pr`
  },
  search: {
    topic: "search",
    description: "调用 BYRDocs 搜索 API 查询资料。",
    usage: "byrdocs search <query> [--limit n] [--type type] [--json]",
    options: ["--limit <n>", "--type <type>"],
    text: `用法：byrdocs search <query> [--limit n] [--type type] [--json]

调用 BYRDocs 搜索 API。无结果也是成功结果。`
  },
  doctor: {
    topic: "doctor",
    description: "检查 CLI、Node、BYRDocs 服务连通性和本地登录状态。",
    usage: "byrdocs doctor [--json]",
    text: `用法：byrdocs doctor [--json]

检查 CLI 版本、Node 版本、主站连通性、搜索 API 连通性和本地 token 是否存在。`
  },
  help: {
    topic: "help",
    description: "显示 BYRDocs CLI 的命令帮助。",
    usage: "byrdocs help [command] [--json]",
    text: `用法：byrdocs help [command] [--json]

示例：
  byrdocs help
  byrdocs help upload
  byrdocs upload --help`
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => {
    process.exitCode = code;
  });
}
