import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type Runtime = {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  env: NodeJS.ProcessEnv;
  cwd: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

export function defaultRuntime(): Runtime {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: process.cwd(),
    fetch: globalThis.fetch.bind(globalThis),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  };
}

export function configDir(env: NodeJS.ProcessEnv): string {
  return env.BYRDOCS_CONFIG_DIR || path.join(os.homedir(), ".byrdocs");
}

export function tokenPath(env: NodeJS.ProcessEnv): string {
  return path.join(configDir(env), "token.json");
}

export function sessionsDir(env: NodeJS.ProcessEnv): string {
  return path.join(configDir(env), "sessions");
}

export async function readToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const raw = await fs.readFile(tokenPath(env), "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === "string" && parsed.token ? parsed.token : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeToken(env: NodeJS.ProcessEnv, token: string): Promise<void> {
  const file = tokenPath(env);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify({ token, saved_at: new Date().toISOString() }, null, 2), {
    mode: 0o600
  });
}

export async function removeToken(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await fs.unlink(tokenPath(env));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export type LoginSession = {
  tokenURL: string;
  created_at: string;
};

export async function saveSession(env: NodeJS.ProcessEnv, sessionId: string, session: LoginSession): Promise<void> {
  const dir = sessionsDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, `${sessionId}.json`), JSON.stringify(session, null, 2), { mode: 0o600 });
}

export async function readSession(env: NodeJS.ProcessEnv, sessionId: string): Promise<LoginSession | null> {
  if (!/^login_[A-Za-z0-9_-]+$/.test(sessionId)) return null;
  try {
    const raw = await fs.readFile(path.join(sessionsDir(env), `${sessionId}.json`), "utf8");
    const parsed = JSON.parse(raw) as LoginSession;
    return typeof parsed.tokenURL === "string" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function clearAuthFiles(env: NodeJS.ProcessEnv): Promise<void> {
  await removeToken(env);
  await fs.rm(sessionsDir(env), { recursive: true, force: true });
}
