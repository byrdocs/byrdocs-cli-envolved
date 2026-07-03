import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCommandArgs } from "./args.js";
import { decodeJwtPayload } from "./auth.js";
import { readToken, type Runtime } from "./config.js";
import { parseFileRef } from "./file-ref.js";
import { apiUrl, asRecord, responseJson } from "./http.js";
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

  let response: Response;
  try {
    response = await runtime.fetch(apiUrl(runtime.env, `/files/${encodeURIComponent(ref.key)}?f=3`), {
      headers: { authorization: `Bearer ${token}` }
    });
  } catch (error) {
    return fail("download", "API_UNREACHABLE", "无法连接 BYRDocs 下载接口。", {
      retryable: true,
      details: { url: apiUrl(runtime.env, `/files/${encodeURIComponent(ref.key)}?f=3`), cause: errorMessage(error) }
    });
  }
  if (response.status === 404) return fail("download", "DOWNLOAD_NOT_FOUND", "文件不存在。", { details: { key: ref.key, status: response.status } });
  if (response.status === 401) return fail("download", "TOKEN_INVALID", "下载凭证无效，请重新登录。", { details: { key: ref.key, status: response.status } });
  if (response.status === 403) return fail("download", "DOWNLOAD_FORBIDDEN", "当前账号无权下载该文件。", { details: { key: ref.key, status: response.status } });
  if (!response.ok) {
    const body = await responseJson(response);
    return fail("download", response.status >= 500 ? "API_UNREACHABLE" : "DOWNLOAD_FORBIDDEN", "下载失败。", {
      retryable: response.status >= 500,
      details: { key: ref.key, status: response.status, response: body }
    });
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = asRecord(await responseJson(response));
    if (body.success === false) {
      const message = typeof body.error === "string" ? body.error : "下载失败。";
      if (message.includes("Not Found") || message.includes("不存在")) {
        return fail("download", "DOWNLOAD_NOT_FOUND", "文件不存在。", { details: body });
      }
      if (message.includes("未授权") || message.includes("Token")) {
        return fail("download", "DOWNLOAD_FORBIDDEN", "当前账号无权下载该文件。", { details: body });
      }
      return fail("download", "DOWNLOAD_FORBIDDEN", message, { details: body });
    }
    return fail("download", "DOWNLOAD_FORBIDDEN", "下载接口返回了非文件响应。", { details: body });
  }
  try {
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return fail("download", "OUTPUT_WRITE_FAILED", "无法写入输出文件。", { details: { output_path: output, cause: errorMessage(error) } });
  }
  return ok("download", { key: ref.key, output_path: output }, `已下载到：${output}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
