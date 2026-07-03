import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCommandArgs, positiveInteger } from "./args.js";
import { readToken, type Runtime } from "./config.js";
import { apiUrl, asRecord, fetchJson } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

const SUPPORTED_EXT = new Set(["pdf", "zip"]);
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

export async function uploadCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const parsed = parseCommandArgs("upload", args, { "chunk-size": { type: "string" } });
  if (!parsed.ok) return parsed.result;
  const inputPath = parsed.parsed.positionals[0];
  if (!inputPath) return fail("upload", "INVALID_ARGUMENT", "缺少待上传文件路径。");
  if (parsed.parsed.positionals.length > 1) return fail("upload", "INVALID_ARGUMENT", "upload 只接受一个文件路径。");
  const chunkSize = chunkSizeFromArgs(parsed.parsed.values);
  if (!chunkSize.ok) return chunkSize.result;
  let token: string | null;
  try {
    token = await readToken(runtime.env);
  } catch (error) {
    return fail("upload", "CONFIG_READ_FAILED", "无法读取本地 token。", { details: { cause: errorMessage(error) } });
  }
  if (!token) return fail("upload", "NOT_LOGGED_IN", "请先运行 byrdocs auth login 登录。");

  let stat;
  try {
    stat = await fs.stat(inputPath);
  } catch (error) {
    return fail("upload", "FILE_NOT_FOUND", "找不到待上传文件。", { details: { input_path: inputPath, cause: errorMessage(error) } });
  }
  if (!stat.isFile()) return fail("upload", "FILE_NOT_FOUND", "待上传路径不是文件。", { details: { input_path: inputPath } });
  if (stat.size > MAX_UPLOAD_SIZE) return fail("upload", "UPLOAD_TOO_LARGE", "文件超过 BYRDocs 当前 2GB 上传限制。", { details: { input_path: inputPath, size: stat.size, limit: MAX_UPLOAD_SIZE } });

  const ext = path.extname(inputPath).slice(1).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) return fail("upload", "UNSUPPORTED_FILE_TYPE", "目前只支持上传 pdf 或 zip 文件。", { details: { input_path: inputPath, ext } });

  const md5 = await fileMd5(inputPath);
  const key = `${md5}.${ext}`;
  const commonData = {
    input_path: inputPath,
    md5,
    key,
    url: `https://byrdocs.org/files/${key}`,
    size: stat.size
  };

  const start = await apiJson(runtime, "/api/r2/mpu-start", token, {
    method: "POST",
    body: JSON.stringify({ key }),
    headers: { "content-type": "application/json" }
  });
  if (!start.ok) {
    if (start.code === "FILE_EXISTS") {
      return ok("upload", { ...commonData, status: "exists", deduplicated: true }, `文件已存在：${key}`);
    }
    return uploadFailure(start.code, start.status, start.body);
  }
  const uploadId = typeof start.body.uploadId === "string" ? start.body.uploadId : null;
  if (!uploadId) return fail("upload", "UPLOAD_FAILED", "上传初始化返回格式不符合预期。", { retryable: true });

  const parts: Array<{ partNumber: number; etag: string }> = [];
  let partNumber = 1;
  try {
    for await (const chunk of fileChunks(inputPath, chunkSize.value)) {
      const form = new FormData();
      const partBytes = new Uint8Array(chunk.byteLength);
      partBytes.set(chunk);
      form.set("key", key);
      form.set("uploadId", uploadId);
      form.set("partNumber", String(partNumber));
      form.set("file", new Blob([partBytes]), `${partNumber}.part`);
      const part = await apiJson(runtime, "/api/r2/mpu-uploadpart", token, { method: "PUT", body: form });
      if (!part.ok) return uploadFailure(part.code, part.status, part.body);
      const etag = typeof part.body.etag === "string" ? part.body.etag : null;
      if (!etag) return fail("upload", "UPLOAD_FAILED", "上传分片返回格式不符合预期。", { retryable: true });
      parts.push({ partNumber, etag });
      partNumber += 1;
    }
  } catch (error) {
    return fail("upload", "UPLOAD_FAILED", "上传文件分片失败。", { retryable: true, details: { input_path: inputPath, cause: errorMessage(error) } });
  }

  const complete = await apiJson(runtime, "/api/r2/mpu-complete", token, {
    method: "POST",
    body: JSON.stringify({ key, uploadId, parts }),
    headers: { "content-type": "application/json" }
  });
  if (!complete.ok) return uploadFailure(complete.code, complete.status, complete.body);
  return ok("upload", { ...commonData, status: "uploaded", deduplicated: false }, `上传完成：${key}`);
}

export async function fileMd5(file: string): Promise<string> {
  const hash = createHash("md5");
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve());
  });
  return hash.digest("hex");
}

async function* fileChunks(file: string, chunkSize: number): AsyncGenerator<Buffer> {
  let pending = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    while (pending.length >= chunkSize) {
      yield pending.subarray(0, chunkSize);
      pending = pending.subarray(chunkSize);
    }
  }
  if (pending.length) yield pending;
}

async function apiJson(runtime: Runtime, pathname: string, token: string, init: RequestInit) {
  try {
    const { response, body } = await fetchJson(runtime, apiUrl(runtime.env, pathname), {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
    });
    const record = asRecord(body);
    const success = record.success;
    const ok = response.ok && success !== false;
    return {
      ok,
      status: response.status,
      body: record,
      code: typeof record.code === "string" ? record.code : undefined
    };
  } catch (error) {
    return { ok: false, status: 0, body: { cause: errorMessage(error) }, code: "API_UNREACHABLE" };
  }
}

function uploadFailure(code: string | undefined, status: number, body: Record<string, unknown>): CliResult {
  const details = { status, ...(code ? { api_code: code } : {}), response: body };
  if (code === "API_UNREACHABLE") return fail("upload", "API_UNREACHABLE", "无法连接 BYRDocs 上传接口。", { retryable: true, details });
  if (status === 401 || status === 403) return fail("upload", "TOKEN_INVALID", "上传凭证无效，请重新登录。", { details });
  if (status === 413) return fail("upload", "UPLOAD_TOO_LARGE", "文件超过 BYRDocs 上传限制。", { details });
  return fail("upload", "UPLOAD_FAILED", "上传失败，请稍后重试。", { retryable: true, details });
}

function chunkSizeFromArgs(values: Record<string, unknown>): { ok: true; value: number } | { ok: false; result: CliResult } {
  if (values["chunk-size"] === undefined) return { ok: true, value: DEFAULT_CHUNK_SIZE };
  return positiveInteger(values["chunk-size"], "upload", "--chunk-size");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
