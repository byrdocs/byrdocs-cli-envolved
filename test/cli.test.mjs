import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decodeJwtPayload } from "../dist/auth.js";
import { run } from "../dist/cli.js";
import { configDir, sessionsDir, tokenPath } from "../dist/config.js";
import { parseFileRef } from "../dist/file-ref.js";

test("file refs parse md5, key, url and reject invalid input", () => {
  const md5 = "e4d909c290d0fb1ca068ffaddf22cbd0";
  assert.deepEqual(parseFileRef(md5), { md5, key: `${md5}.pdf`, ext: "pdf" });
  assert.deepEqual(parseFileRef(`${md5}.zip`), { md5, key: `${md5}.zip`, ext: "zip" });
  assert.deepEqual(parseFileRef(`https://byrdocs.org/files/${md5}.pdf`), { md5, key: `${md5}.pdf`, ext: "pdf" });
  assert.equal(parseFileRef("https://example.com/files/nope.pdf"), null);
});

test("default config lives in ~/.byrdocs unless overridden", () => {
  assert.equal(configDir({}), path.join(os.homedir(), ".byrdocs"));
  assert.equal(tokenPath({}), path.join(os.homedir(), ".byrdocs", "token.json"));
  assert.equal(sessionsDir({}), path.join(os.homedir(), ".byrdocs", "sessions"));
  assert.equal(configDir({ BYRDOCS_CONFIG_DIR: "/tmp/custom-byrdocs" }), "/tmp/custom-byrdocs");
});

test("auth status decodes BUPT and GitHub JWT claims locally", async () => {
  const dir = await tempDir();
  await saveToken(dir, jwt({ id: "BUPT-20240001", download: true }));
  const bupt = await runCli(["auth", "status", "--json"], { dir });
  assert.equal(bupt.code, 0);
  assert.equal(bupt.json.data.provider, "bupt");
  assert.equal(bupt.json.data.can_download, true);
  assert.equal(bupt.json.data.source, "local_jwt_claims");
  assert.equal(bupt.json.data.trusted, false);

  await saveToken(dir, jwt({ id: "GitHub-12345" }));
  const github = await runCli(["auth", "status", "--json"], { dir });
  assert.equal(github.json.data.provider, "github");
  assert.equal(github.json.data.can_download, false);
  assert.deepEqual(decodeJwtPayload(jwt({ id: "GitHub-1" })).id, "GitHub-1");
});

test("auth rejects abandoned manual token commands", async () => {
  const dir = await tempDir();
  const token = jwt({ id: "BUPT-legacy", download: true });
  await writeFile(path.join(dir, "token"), token, "utf8");
  const status = await runCli(["auth", "status", "--json"], { dir });
  assert.equal(status.code, 0);
  assert.equal(status.json.data.logged_in, false);

  const login = await runCli(["login", "--token", token, "--json"], { dir });
  assert.equal(login.code, 1);
  assert.equal(login.json.error.code, "INVALID_ARGUMENT");

  const authLogin = await runCli(["auth", "login", "--token", token, "--json"], { dir });
  assert.equal(authLogin.code, 1);
  assert.equal(authLogin.json.error.code, "INVALID_ARGUMENT");
});

test("auth wait saves a valid token and rejects expired sessions", async () => {
  const dir = await tempDir();
  const sessionId = "login_test";
  await mkdir(path.join(dir, "sessions"), { recursive: true });
  await writeFile(path.join(dir, "sessions", `${sessionId}.json`), JSON.stringify({ tokenURL: "https://byrdocs.test/token", created_at: new Date().toISOString() }));
  const token = jwt({ id: "GitHub-42" });
  const wait = await runCli(["auth", "wait", sessionId, "--json"], {
    dir,
    fetch: async () => jsonResponse({ token, success: true })
  });
  assert.equal(wait.code, 0);
  assert.equal(wait.json.data.logged_in, true);
  assert.equal(JSON.parse(await readFile(path.join(dir, "token.json"), "utf8")).token, token);

  const expiredDir = await tempDir();
  await mkdir(path.join(expiredDir, "sessions"), { recursive: true });
  await writeFile(path.join(expiredDir, "sessions", `${sessionId}.json`), JSON.stringify({ tokenURL: "https://byrdocs.test/token", created_at: new Date().toISOString() }));
  const expired = await runCli(["auth", "wait", sessionId, "--json"], {
    dir: expiredDir,
    fetch: async () => jsonResponse({ error: "会话过期，请重新登录", success: false })
  });
  assert.equal(expired.code, 1);
  assert.equal(expired.json.error.code, "LOGIN_EXPIRED");
});

test("auth login waits by default and --no-wait only creates a session", async () => {
  const dir = await tempDir();
  const token = jwt({ id: "GitHub-99" });
  const calls = [];
  const login = await runCli(["auth", "login", "--json"], {
    dir,
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/auth/login")) {
        return jsonResponse({ loginURL: "https://byrdocs.test/login", tokenURL: "https://byrdocs.test/token" });
      }
      return jsonResponse({ token, success: true });
    }
  });
  assert.equal(login.code, 0);
  assert.equal(login.json.command, "auth.login");
  assert.equal(login.json.data.logged_in, true);
  assert.equal(JSON.parse(await readFile(path.join(dir, "token.json"), "utf8")).token, token);
  assert.match(login.stderr, /正在等待网页登录完成/);
  assert.deepEqual(calls, ["https://byrdocs.test/api/auth/login", "https://byrdocs.test/token"]);

  const noWaitDir = await tempDir();
  const noWaitCalls = [];
  const noWait = await runCli(["auth", "login", "--no-wait", "--json"], {
    dir: noWaitDir,
    fetch: async (url) => {
      noWaitCalls.push(String(url));
      return jsonResponse({ loginURL: "https://byrdocs.test/login", tokenURL: "https://byrdocs.test/token" });
    }
  });
  assert.equal(noWait.code, 0);
  assert.equal(noWait.json.data.status, "user_action_required");
  assert.match(noWait.json.data.session_id, /^login_/);
  assert.equal(noWait.stderr, "");
  assert.deepEqual(noWaitCalls, ["https://byrdocs.test/api/auth/login"]);
});

test("auth wait aborts long-poll fetch when CLI timeout expires", async () => {
  const dir = await tempDir();
  const sessionId = "login_timeout";
  await mkdir(path.join(dir, "sessions"), { recursive: true });
  await writeFile(path.join(dir, "sessions", `${sessionId}.json`), JSON.stringify({ tokenURL: "https://byrdocs.test/token", created_at: new Date().toISOString() }));
  let sawSignal = false;
  const result = await runCli(["auth", "wait", sessionId, "--timeout-seconds", "0.01", "--json"], {
    dir,
    fetch: async (_url, init) => {
      sawSignal = Boolean(init.signal);
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
  });
  assert.equal(sawSignal, true);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "LOGIN_TIMEOUT");
});

test("--json writes one envelope to stdout and keeps stderr empty for stable commands", async () => {
  const result = await runCli(["meta", "schema", "--json"]);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.json.schema_version, "byrdocs.cli.v1");
  assert.equal(result.json.ok, true);
  assert.equal(result.json.error, undefined);

  const failed = await runCli(["unknown-command", "--json"]);
  assert.equal(failed.code, 1);
  assert.equal(failed.stderr, "");
  assert.equal(failed.json.ok, false);
  assert.equal(failed.json.error.code, "INVALID_ARGUMENT");
  assert.equal(failed.json.data, undefined);
});

test("invalid command options fail instead of being ignored or treated as positionals", async () => {
  const badLimit = await runCli(["search", "高等数学", "--limit", "nope", "--json"]);
  assert.equal(badLimit.code, 1);
  assert.equal(badLimit.json.error.code, "INVALID_ARGUMENT");
  assert.deepEqual(badLimit.json.error.details, { option: "--limit", received: "nope" });
  assert.ok(badLimit.json.error.suggestions.some((item) => item.includes("help")));

  const badLimitText = await runCliText(["search", "高等数学", "--limit", "nope"]);
  assert.equal(badLimitText.code, 1);
  assert.match(badLimitText.stdout, /错误\(INVALID_ARGUMENT\)/);
  assert.match(badLimitText.stdout, /详情：/);
  assert.match(badLimitText.stdout, /建议：/);

  const missingLimit = await runCli(["search", "高等数学", "--limit", "--json"]);
  assert.equal(missingLimit.code, 1);
  assert.equal(missingLimit.json.error.code, "INVALID_ARGUMENT");

  const badChunkSize = await runCli(["upload", "file.pdf", "--chunk-size", "nope", "--json"]);
  assert.equal(badChunkSize.code, 1);
  assert.equal(badChunkSize.json.error.code, "INVALID_ARGUMENT");
  assert.deepEqual(badChunkSize.json.error.details, { option: "--chunk-size", received: "nope" });
});

test("help command and --help return usage successfully", async () => {
  const main = await runCli(["help", "--json"]);
  assert.equal(main.code, 0);
  assert.equal(main.json.command, "help");
  assert.match(main.json.data.description, /BYRDocs Agent CLI/);
  assert.equal(main.json.data.usage, "byrdocs <command> [args] [--json]");
  assert.match(main.json.data.text, /命令：/);
  assert.ok(main.json.data.commands.includes("upload <file>"));

  const upload = await runCli(["upload", "--help", "--json"]);
  assert.equal(upload.code, 0);
  assert.equal(upload.json.data.topic, "upload");
  assert.match(upload.json.data.description, /上传 pdf 或 zip/);
  assert.match(upload.json.data.text, /只支持 pdf 和 zip/);
  assert.match(upload.stdout, /chunk-size/);

  const noArgs = await runCli(["--json"]);
  assert.equal(noArgs.code, 0);
  assert.equal(noArgs.json.command, "help");
});

test("upload maps FILE_EXISTS to a successful deduplicated result", async () => {
  const dir = await tempDir();
  await saveToken(dir, jwt({ id: "BUPT-1", download: true }));
  const file = path.join(dir, "hello.pdf");
  await writeFile(file, "hello");
  const calls = [];
  const result = await runCli(["upload", file, "--json"], {
    dir,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ success: false, code: "FILE_EXISTS", error: "文件已存在" }, { status: 409 });
    }
  });
  assert.equal(result.code, 0);
  assert.equal(result.json.data.status, "exists");
  assert.equal(result.json.data.deduplicated, true);
  assert.equal(result.json.data.md5, "5d41402abc4b2a76b9719d911017c592");
  assert.equal(result.json.data.key, "5d41402abc4b2a76b9719d911017c592.pdf");
  assert.equal(calls.length, 1);
});

test("download distinguishes missing token and token without download capability", async () => {
  const dir = await tempDir();
  const key = "e4d909c290d0fb1ca068ffaddf22cbd0.pdf";
  const missing = await runCli(["download", key, "--output", path.join(dir, "out.pdf"), "--json"], { dir });
  assert.equal(missing.code, 1);
  assert.equal(missing.json.error.code, "NOT_LOGGED_IN");

  await saveToken(dir, jwt({ id: "GitHub-1" }));
  let called = false;
  const github = await runCli(["download", key, "--output", path.join(dir, "out.pdf"), "--json"], {
    dir,
    fetch: async () => {
      called = true;
      return new Response("nope", { status: 403 });
    }
  });
  assert.equal(github.code, 1);
  assert.equal(github.json.error.code, "BUPT_LOGIN_REQUIRED");
  assert.equal(called, false);
});

test("download uses site file route and maps site responses", async () => {
  const dir = await tempDir();
  await saveToken(dir, jwt({ id: "BUPT-1", download: true }));
  const key = "e4d909c290d0fb1ca068ffaddf22cbd0.pdf";
  const output = path.join(dir, "out.pdf");
  let seenUrl = "";
  const okDownload = await runCli(["download", key, "--output", output, "--json"], {
    dir,
    fetch: async (url) => {
      seenUrl = String(url);
      return new Response("pdf-body", { status: 200, headers: { "content-type": "application/pdf" } });
    }
  });
  assert.equal(okDownload.code, 0);
  assert.match(seenUrl, /\/files\/e4d909c290d0fb1ca068ffaddf22cbd0\.pdf\?f=3$/);
  assert.equal(await readFile(output, "utf8"), "pdf-body");

  const unauthorizedOutput = path.join(dir, "unauthorized.pdf");
  const unauthorized = await runCli(["download", key, "--output", unauthorizedOutput, "--json"], {
    dir,
    fetch: async () => jsonResponse({ error: "未授权，请登录后重试", success: false }, { status: 401 })
  });
  assert.equal(unauthorized.code, 1);
  assert.equal(unauthorized.json.error.code, "DOWNLOAD_UNAUTHORIZED");
  assert.equal(unauthorized.json.error.details.status, 401);
  await assert.rejects(access(unauthorizedOutput));

  const missingOutput = path.join(dir, "missing.pdf");
  const missing = await runCli(["download", key, "--output", missingOutput, "--json"], {
    dir,
    fetch: async () => new Response("Object Not Found", { status: 404 })
  });
  assert.equal(missing.code, 1);
  assert.equal(missing.json.error.code, "DOWNLOAD_NOT_FOUND");
  assert.equal(missing.json.error.details.response, "Object Not Found");
  await assert.rejects(access(missingOutput));

  const jsonOutput = path.join(dir, "json-error.pdf");
  const jsonError = await runCli(["download", key, "--output", jsonOutput, "--json"], {
    dir,
    fetch: async () => jsonResponse({ error: "API Not Found", success: false })
  });
  assert.equal(jsonError.code, 1);
  assert.equal(jsonError.json.error.code, "DOWNLOAD_FAILED");
  assert.equal(jsonError.json.error.message, "下载接口返回了 JSON，而不是文件内容。");
  await assert.rejects(access(jsonOutput));
});

test("meta init, validate, preview and YAML parse errors", async () => {
  const dir = await tempDir();
  const md5 = "e4d909c290d0fb1ca068ffaddf22cbd0";
  const yaml = path.join(dir, `${md5}.yaml`);
  const init = await runCli(["meta", "init", `${md5}.pdf`, "--type", "book", "--out", yaml, "--json"], { dir });
  assert.equal(init.code, 0);
  assert.equal(init.json.data.md5, md5);
  assert.ok(init.json.data.needs_user_input.length > 0);

  const invalid = await runCli(["meta", "validate", yaml, "--json"], { dir });
  assert.equal(invalid.code, 1);
  assert.equal(invalid.json.error.code, "METADATA_VALIDATION_FAILED");
  assert.ok(invalid.json.error.diagnostics.some((item) => item.code === "REQUIRED_FIELD_MISSING"));

  const preview = await runCli(["meta", "preview", yaml, "--json"], { dir });
  assert.equal(preview.code, 0);
  assert.equal(preview.json.data.ready_for_pr, false);

  const badYaml = path.join(dir, "bad.yaml");
  await writeFile(badYaml, "type: [");
  const parse = await runCli(["meta", "validate", badYaml, "--json"], { dir });
  assert.equal(parse.code, 1);
  assert.equal(parse.json.error.code, "YAML_PARSE_ERROR");
});

test("meta schema prefers remote schema and validates against latest required fields", async () => {
  const dir = await tempDir();
  const md5 = "e4d909c290d0fb1ca068ffaddf22cbd0";
  const fetch = async (url) => {
    assert.match(String(url), /\/schema\/test\.yaml$/);
    return textResponse(`type: object
properties:
  id:
    type: string
  url:
    type: string
  type:
    type: string
    enum: [test]
  data:
    type: object
    properties:
      course:
        type: object
        properties:
          name:
            type: string
        required: [name]
      time:
        type: object
        properties:
          start:
            type: string
          end:
            type: string
        required: [start, end]
      filetype:
        type: string
        enum: [pdf]
      content:
        type: array
        items:
          type: string
    required: [course, time, filetype, content]
required: [id, url, type, data]
`);
  };

  const schema = await runCli(["meta", "schema", "--type", "test", "--json"], { dir, fetch });
  assert.equal(schema.code, 0);
  assert.equal(schema.json.data.source, "remote");
  assert.ok(schema.json.data.required.includes("$.data.time.start"));
  assert.equal(schema.json.data.required.includes("$.data.filesize"), false);

  const yaml = path.join(dir, `${md5}.yaml`);
  await writeFile(
    yaml,
    `type: test
id: ${md5}
url: https://byrdocs.org/files/${md5}.pdf
data:
  course:
    name: 高等数学A（上）
  time:
    start: "2024"
    end: "2025"
  filetype: pdf
  content:
    - 原题
`,
    "utf8"
  );
  const valid = await runCli(["meta", "validate", yaml, "--json"], { dir, fetch });
  assert.equal(valid.code, 0);
  assert.equal(valid.json.data.schema_source, "remote");
});

test("search posts keyword, limit and optional type", async () => {
  const result = await runCli(["search", "高等数学", "--limit", "2", "--type", "book", "--json"], {
    fetch: async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { keyword: "高等数学", limit: 2, type: "book" });
      return jsonResponse({ results: [{ title: "高等数学" }] });
    }
  });
  assert.equal(result.code, 0);
  assert.equal(result.json.data.results.length, 1);
});

async function runCli(args, options = {}) {
  let stdout = "";
  let stderr = "";
  const dir = options.dir || (await tempDir());
  const env = {
    ...process.env,
    BYRDOCS_CONFIG_DIR: dir,
    BYRDOCS_API_BASE: "https://byrdocs.test",
    BYRDOCS_SEARCH_URL: "https://search.byrdocs.test/api/search",
    ...(options.env || {})
  };
  const code = await run(args, {
    stdout: { write: (text) => (stdout += String(text)) },
    stderr: { write: (text) => (stderr += String(text)) },
    env,
    cwd: dir,
    fetch: options.fetch || (async () => jsonResponse({ success: true })),
    sleep: async () => {}
  });
  return { code, stdout, stderr, json: JSON.parse(stdout) };
}

async function runCliText(args, options = {}) {
  let stdout = "";
  let stderr = "";
  const dir = options.dir || (await tempDir());
  const env = {
    ...process.env,
    BYRDOCS_CONFIG_DIR: dir,
    BYRDOCS_API_BASE: "https://byrdocs.test",
    BYRDOCS_SEARCH_URL: "https://search.byrdocs.test/api/search",
    ...(options.env || {})
  };
  const code = await run(args, {
    stdout: { write: (text) => (stdout += String(text)) },
    stderr: { write: (text) => (stderr += String(text)) },
    env,
    cwd: dir,
    fetch: options.fetch || (async () => jsonResponse({ success: true })),
    sleep: async () => {}
  });
  return { code, stdout, stderr };
}

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "byrdocs-cli-test-"));
}

function jwt(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

async function saveToken(dir, token) {
  const file = path.join(dir, "token.json");
  await writeFile(file, JSON.stringify({ token }), "utf8");
  assert.equal(JSON.parse(await readFile(file, "utf8")).token, token);
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { "content-type": "text/yaml" }
  });
}
