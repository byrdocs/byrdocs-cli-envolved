import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCommandArgs } from "./args.js";
import { decodeJwtPayload } from "./auth.js";
import { readToken, type Runtime } from "./config.js";
import { parseFileRef } from "./file-ref.js";
import { apiUrl, responseJson } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

export async function downloadCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const parsed = parseCommandArgs("download", args, { output: { type: "string" } });
  if (!parsed.ok) return parsed.result;
  const input = parsed.parsed.positionals[0];
  const output = typeof parsed.parsed.values.output === "string" ? parsed.parsed.values.output : null;
  if (!input) return fail("download", "INVALID_ARGUMENT", "缺少文件引用。");
  if (parsed.parsed.positionals.length > 1) return fail("download", "INVALID_ARGUMENT", "download 只接受一个文件引用。");
  if (!output) return fail("download", "OUTPUT_PATH_REQUIRED", "下载必须使用 --output 指定写入路径。");
  const ref = parseFileRef(input);
  if (!ref) return fail("download", "INVALID_FILE_REF", "文件引用格式不正确。");

  let token: string | null;
  try {
    token = await readToken(runtime.env);
  } catch (error) {
    return fail("download", "CONFIG_READ_FAILED", "无法读取本地 token。", { details: { cause: errorMessage(error) } });
  }
  if (!token) return fail("download", "NOT_LOGGED_IN", "请先运行 byrdocs auth login 登录。");
  const claims = decodeJwtPayload(token);
  if (!claims?.download) return fail("download", "BUPT_LOGIN_REQUIRED", "当前 token 没有下载权限，请使用 BUPT 统一认证登录。");

  const outputName = path.basename(output);
  const filename = ref.filename ?? (outputName || ref.key);
  const url = downloadUrl(runtime, ref.key, filename);
  let response: Response;
  try {
    response = await runtime.fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    });
  } catch (error) {
    return fail("download", "API_UNREACHABLE", "无法连接 BYRDocs 下载接口。", {
      retryable: true,
      details: { url, cause: errorMessage(error) }
    });
  }
  const failure = await downloadFailure(response, ref.key, url);
  if (failure) return failure;

  try {
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return fail("download", "OUTPUT_WRITE_FAILED", "无法写入输出文件。", { details: { output_path: output, cause: errorMessage(error) } });
  }
  return ok("download", { key: ref.key, filename, output_path: output }, `已下载到：${output}`);
}

function downloadUrl(runtime: Runtime, key: string, filename: string): string {
  const searchParams = new URLSearchParams({ filename, f: "3" });
  return apiUrl(runtime.env, `/files/${encodeURIComponent(key)}?${searchParams.toString()}`);
}

async function downloadFailure(response: Response, key: string, url: string): Promise<CliResult | null> {
  if (response.status === 401) {
    return fail("download", "DOWNLOAD_UNAUTHORIZED", "主站拒绝了本次下载请求，请重新使用 BUPT 统一认证登录。", {
      details: { key, url, status: response.status, response: await responseJson(response) }
    });
  }
  if (response.status === 404) {
    return fail("download", "DOWNLOAD_NOT_FOUND", "文件不存在。", { details: { key, url, status: response.status, response: await response.text() } });
  }
  if (!response.ok) {
    return fail("download", "DOWNLOAD_FAILED", "下载请求失败。", {
      retryable: response.status >= 500 || response.status === 429 || response.status === 408,
      details: { key, url, status: response.status, response: await responseJson(response) }
    });
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    return fail("download", "DOWNLOAD_FAILED", "下载接口返回了 JSON，而不是文件内容。", {
      details: { key, url, status: response.status, response: await responseJson(response) }
    });
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
