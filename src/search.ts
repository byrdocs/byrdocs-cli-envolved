import type { Runtime } from "./config.js";
import { parseCommandArgs, positiveInteger } from "./args.js";
import { asRecord, fetchJson, searchEndpoint } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

export async function searchCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const options = parseSearchArgs(args);
  if (!options.ok) return options.result;
  if (!options.query) return fail("search", "INVALID_ARGUMENT", "缺少搜索关键词。");
  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await fetchJson(runtime, searchEndpoint(runtime.env), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keyword: options.query,
        limit: options.limit,
        ...(options.type ? { type: options.type } : {})
      })
    }));
  } catch {
    return fail("search", "SEARCH_API_UNREACHABLE", "无法连接 BYRDocs 搜索接口。", { retryable: true });
  }
  if (!response.ok) return fail("search", "SEARCH_FAILED", "搜索请求失败，请稍后重试。", { retryable: true });
  const record = asRecord(body);
  const results = Array.isArray(record.results) ? record.results : Array.isArray(record.data) ? record.data : Array.isArray(body) ? body : [];
  return ok("search", { query: options.query, limit: options.limit, ...(options.type ? { type: options.type } : {}), results }, `找到 ${results.length} 条结果。`);
}

function parseSearchArgs(args: string[]): { ok: true; query: string; limit: number; type?: string } | { ok: false; result: CliResult } {
  const parsed = parseCommandArgs("search", args, { limit: { type: "string" }, type: { type: "string" } });
  if (!parsed.ok) return parsed;
  const limit = parsed.parsed.values.limit === undefined ? { ok: true as const, value: 10 } : positiveInteger(parsed.parsed.values.limit, "search", "--limit");
  if (!limit.ok) return limit;
  const type = typeof parsed.parsed.values.type === "string" ? parsed.parsed.values.type : undefined;
  return { ok: true, query: parsed.parsed.positionals.join(" "), limit: limit.value, type };
}
