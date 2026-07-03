import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readToken, type Runtime } from "./config.js";
import { apiUrl, asRecord, fetchJson } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

const SUPPORTED_EXT = new Set(["pdf", "zip"]);
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

export async function uploadCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const inputPath = args[0];
  if (!inputPath) return fail("upload", "INVALID_ARGUMENT", "缺少待上传文件路径。");
  let token: string | null;
  try {
    token = await readToken(runtime.env);
  } catch {
    return fail("upload", "CONFIG_READ_FAILED", "无法读取本地 token。");
  }
  if (!token) return fail("upload", "NOT_LOGGED_IN", "请先运行 byrdocs auth login 登录。");

  let stat;
  try {
    stat = await fs.stat(inputPath);
  } catch {
    return fail("upload", "FILE_NOT_FOUND", "找不到待上传文件。");
  }
  if (!stat.isFile()) return fail("upload", "FILE_NOT_FOUND", "待上传路径不是文件。");
  if (stat.size > MAX_UPLOAD_SIZE) return fail("upload", "UPLOAD_TOO_LARGE", "文件超过 BYRDocs 当前 2GB 上传限制。");

  const ext = path.extname(inputPath).slice(1).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) return fail("upload", "UNSUPPORTED_FILE_TYPE", "目前只支持上传 pdf 或 zip 文件。");

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
    return uploadFailure(start.code, start.status);
  }
  const uploadId = typeof start.body.uploadId === "string" ? start.body.uploadId : null;
  if (!uploadId) return fail("upload", "UPLOAD_FAILED", "上传初始化返回格式不符合预期。", { retryable: true });

  const chunkSize = chunkSizeFromArgs(args);
  const parts: Array<{ partNumber: number; etag: string }> = [];
  let partNumber = 1;
  try {
    for await (const chunk of fileChunks(inputPath, chunkSize)) {
      const form = new FormData();
      const partBytes = new Uint8Array(chunk.byteLength);
      partBytes.set(chunk);
      form.set("key", key);
      form.set("uploadId", uploadId);
      form.set("partNumber", String(partNumber));
      form.set("file", new Blob([partBytes]), `${partNumber}.part`);
      const part = await apiJson(runtime, "/api/r2/mpu-uploadpart", token, { method: "PUT", body: form });
      if (!part.ok) return uploadFailure(part.code, part.status);
      const etag = typeof part.body.etag === "string" ? part.body.etag : null;
      if (!etag) return fail("upload", "UPLOAD_FAILED", "上传分片返回格式不符合预期。", { retryable: true });
      parts.push({ partNumber, etag });
      partNumber += 1;
    }
  } catch {
    return fail("upload", "UPLOAD_FAILED", "上传文件分片失败。", { retryable: true });
  }

  const complete = await apiJson(runtime, "/api/r2/mpu-complete", token, {
    method: "POST",
    body: JSON.stringify({ key, uploadId, parts }),
    headers: { "content-type": "application/json" }
  });
  if (!complete.ok) return uploadFailure(complete.code, complete.status);
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
  } catch {
    return { ok: false, status: 0, body: {}, code: "API_UNREACHABLE" };
  }
}

function uploadFailure(code: string | undefined, status: number): CliResult {
  if (code === "API_UNREACHABLE") return fail("upload", "API_UNREACHABLE", "无法连接 BYRDocs 上传接口。", { retryable: true });
  if (status === 401 || status === 403) return fail("upload", "TOKEN_INVALID", "上传凭证无效，请重新登录。");
  if (status === 413) return fail("upload", "UPLOAD_TOO_LARGE", "文件超过 BYRDocs 上传限制。");
  return fail("upload", "UPLOAD_FAILED", "上传失败，请稍后重试。", { retryable: true, details: code ? { api_code: code } : undefined });
}

function chunkSizeFromArgs(args: string[]): number {
  const index = args.indexOf("--chunk-size");
  if (index === -1 || !args[index + 1]) return DEFAULT_CHUNK_SIZE;
  const parsed = Number(args[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHUNK_SIZE;
}
