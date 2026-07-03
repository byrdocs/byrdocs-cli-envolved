import { randomUUID } from "node:crypto";
import { parseCommandArgs, positiveNumber } from "./args.js";
import { clearAuthFiles, readSession, readToken, saveSession, writeToken, type Runtime } from "./config.js";
import { apiUrl, asRecord, fetchJson } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

export type JwtClaims = Record<string, unknown> & {
  id?: string;
  download?: boolean;
  exp?: number;
};

export function decodeJwtPayload(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json) as JwtClaims;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function claimsStatus(claims: JwtClaims): {
  id: string | null;
  provider: "bupt" | "github" | "unknown";
  can_upload: boolean;
  can_download: boolean;
  source: "local_jwt_claims";
  trusted: false;
} {
  const id = typeof claims.id === "string" ? claims.id : null;
  const provider = id?.startsWith("BUPT-") ? "bupt" : id?.startsWith("GitHub-") ? "github" : "unknown";
  return {
    id,
    provider,
    can_upload: Boolean(id),
    can_download: claims.download === true,
    source: "local_jwt_claims",
    trusted: false
  };
}

export async function authCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const sub = args[0];
  if (sub === "login") return login(runtime, args.slice(1));
  if (sub === "wait") return wait(runtime, args.slice(1));
  if (sub === "status") return status(runtime);
  if (sub === "logout") return logout(runtime);
  return fail("auth", "INVALID_ARGUMENT", "未知 auth 子命令。");
}

async function login(runtime: Runtime, args: string[]): Promise<CliResult> {
  const parsed = parseCommandArgs("auth.login", args, {
    "no-wait": { type: "boolean" },
    timeout: { type: "string" },
    "timeout-seconds": { type: "string" },
    "interval-ms": { type: "string" }
  });
  if (!parsed.ok) return parsed.result;
  if (parsed.parsed.positionals.length) return fail("auth.login", "INVALID_ARGUMENT", "auth login 不接受额外位置参数。");
  const options = parseWaitOptions(parsed.parsed.values, "auth.login");
  if ("exitCode" in options) return options;

  const session = await createLoginSession(runtime);
  if (!session.ok) return session.result;
  const started = loginStartedResult(session);
  if (parsed.parsed.values["no-wait"] === true) return started;
  runtime.stderr.write(`请在浏览器打开登录链接：\n${session.loginURL}\n正在等待网页登录完成...\n`);
  return pollToken(runtime, "auth.login", session.tokenURL, options);
}

async function createLoginSession(
  runtime: Runtime
): Promise<{ ok: true; loginURL: string; tokenURL: string; sessionId: string } | { ok: false; result: CliResult }> {
  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await fetchJson(runtime, apiUrl(runtime.env, "/api/auth/login"), { method: "POST" }));
  } catch {
    return { ok: false, result: fail("auth.login", "API_UNREACHABLE", "无法连接 BYRDocs 登录接口。", { retryable: true }) };
  }
  if (!response.ok) {
    return { ok: false, result: fail("auth.login", "API_UNREACHABLE", "BYRDocs 登录接口暂时不可用。", { retryable: true }) };
  }
  const data = asRecord(body);
  const tokenURL = typeof data.tokenURL === "string" ? data.tokenURL : null;
  const loginURL = typeof data.loginURL === "string" ? data.loginURL : null;
  if (!tokenURL || !loginURL) {
    return { ok: false, result: fail("auth.login", "UNKNOWN_ERROR", "登录接口返回格式不符合预期。", { details: { response: redactAuthBody(data) } }) };
  }
  const sessionId = `login_${randomUUID().replaceAll("-", "")}`;
  try {
    await saveSession(runtime.env, sessionId, { tokenURL, created_at: new Date().toISOString() });
  } catch {
    return { ok: false, result: fail("auth.login", "CONFIG_WRITE_FAILED", "无法保存本地登录会话。") };
  }
  return { ok: true, loginURL, tokenURL, sessionId };
}

function loginStartedResult(session: { loginURL: string; sessionId: string }): CliResult {
  return ok(
    "auth.login",
    {
      status: "user_action_required",
      login_url: session.loginURL,
      session_id: session.sessionId,
      poll_command: `byrdocs auth wait ${session.sessionId} --json`
    },
    `请在浏览器打开登录链接：\n${session.loginURL}\n然后运行：byrdocs auth wait ${session.sessionId}`
  );
}

async function wait(runtime: Runtime, args: string[]): Promise<CliResult> {
  const parsed = parseCommandArgs("auth.wait", args, {
    timeout: { type: "string" },
    "timeout-seconds": { type: "string" },
    "interval-ms": { type: "string" }
  });
  if (!parsed.ok) return parsed.result;
  const sessionId = parsed.parsed.positionals[0];
  if (!sessionId) return fail("auth.wait", "INVALID_ARGUMENT", "缺少 session-id。");
  if (parsed.parsed.positionals.length > 1) return fail("auth.wait", "INVALID_ARGUMENT", "auth wait 只接受一个 session-id。");
  const options = parseWaitOptions(parsed.parsed.values, "auth.wait");
  if ("exitCode" in options) return options;
  let session;
  try {
    session = await readSession(runtime.env, sessionId);
  } catch {
    return fail("auth.wait", "CONFIG_READ_FAILED", "无法读取本地登录会话。");
  }
  if (!session) return fail("auth.wait", "LOGIN_SESSION_NOT_FOUND", "本地登录会话不存在或已失效。");

  return pollToken(runtime, "auth.wait", session.tokenURL, options);
}

async function pollToken(runtime: Runtime, command: string, tokenURL: string, options: { timeoutMs: number; intervalMs: number }): Promise<CliResult> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() <= deadline) {
    let response: Response;
    let body: unknown;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      ({ response, body } = await fetchJson(runtime, tokenURL, { method: "GET", signal: controller.signal }));
    } catch {
      if (controller.signal.aborted) {
        return fail(command, "LOGIN_TIMEOUT", "等待登录超时，请确认浏览器登录是否完成。", { retryable: true });
      }
      return fail(command, "API_UNREACHABLE", "无法连接 BYRDocs token 轮询接口。", { retryable: true });
    } finally {
      clearTimeout(timeout);
    }

    const data = asRecord(body);
    const token = extractToken(data);
    if (response.ok && token) {
      return saveToken(runtime, command, token);
    }

    const code = typeof data.code === "string" ? data.code : "";
    const message = typeof data.error === "string" ? data.error : "";
    if (response.status === 410 || code === "LOGIN_EXPIRED" || message.includes("过期")) {
      return fail(command, "LOGIN_EXPIRED", "登录会话已过期，请重新运行 auth login。");
    }
    if (response.status === 403 || code === "LOGIN_DENIED") {
      return fail(command, "LOGIN_DENIED", "用户拒绝了本次登录。");
    }
    await runtime.sleep(options.intervalMs);
  }
  return fail(command, "LOGIN_TIMEOUT", "等待登录超时，请确认浏览器登录是否完成。", { retryable: true });
}

async function status(runtime: Runtime): Promise<CliResult> {
  let token: string | null;
  try {
    token = await readToken(runtime.env);
  } catch {
    return fail("auth.status", "CONFIG_READ_FAILED", "无法读取本地 token。");
  }
  if (!token) return ok("auth.status", { logged_in: false }, "当前未登录 BYRDocs。");
  const claims = decodeJwtPayload(token);
  if (!claims || typeof claims.id !== "string") {
    return fail("auth.status", "TOKEN_INVALID", "本地 token 无法解析，请重新登录。");
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    return fail("auth.status", "TOKEN_INVALID", "本地 token 已过期，请重新登录。");
  }
  return ok("auth.status", { logged_in: true, ...claimsStatus(claims) }, `已登录：${claims.id}`);
}

async function logout(runtime: Runtime): Promise<CliResult> {
  try {
    await clearAuthFiles(runtime.env);
  } catch {
    return fail("auth.logout", "CONFIG_WRITE_FAILED", "无法删除本地登录信息。");
  }
  return ok("auth.logout", { logged_in: false }, "已退出 BYRDocs 登录。");
}

async function saveToken(runtime: Runtime, command: string, token: string): Promise<CliResult> {
  const claims = decodeJwtPayload(token);
  if (!claims || typeof claims.id !== "string") {
    return fail(command, "TOKEN_INVALID", "登录接口返回的 token 无法解析，请重新登录。");
  }
  try {
    await writeToken(runtime.env, token);
  } catch {
    return fail(command, "AUTH_TOKEN_SAVE_FAILED", "登录成功，但无法保存本地 token。");
  }
  return ok(command, { status: "logged_in", logged_in: true, ...claimsStatus(claims) }, `BYRDocs 登录成功：${claims.id}`);
}

function extractToken(data: Record<string, unknown>): string | null {
  for (const key of ["token", "jwt", "access_token"]) {
    if (typeof data[key] === "string" && data[key]) return data[key];
  }
  return null;
}

function parseWaitOptions(values: Record<string, unknown>, command: string): { timeoutMs: number; intervalMs: number } | CliResult {
  let timeoutMs = 180_000;
  let intervalMs = 2_000;
  const timeout = values["timeout-seconds"] ?? values.timeout;
  if (timeout !== undefined) {
    const parsed = positiveNumber(timeout, command, "--timeout-seconds");
    if (!parsed.ok) return parsed.result;
    timeoutMs = parsed.value * 1000;
  }
  if (values["interval-ms"] !== undefined) {
    const parsed = positiveNumber(values["interval-ms"], command, "--interval-ms");
    if (!parsed.ok) return parsed.result;
    intervalMs = parsed.value;
  }
  return { timeoutMs, intervalMs };
}

function redactAuthBody(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, key.toLowerCase().includes("token") ? "<redacted>" : value]));
}
