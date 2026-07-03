import type { Runtime } from "./config.js";
import { asRecord, fetchJson, searchEndpoint } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

export async function searchCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const options = parseSearchArgs(args);
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

function parseSearchArgs(args: string[]): { query: string; limit: number; type?: string } {
  let limit = 10;
  let type: string | undefined;
  const query: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--limit" && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      limit = Number.isFinite(parsed) && parsed > 0 ? parsed : limit;
      i += 1;
    } else if (args[i] === "--type" && args[i + 1]) {
      type = args[i + 1];
      i += 1;
    } else {
      query.push(args[i]);
    }
  }
  return { query: query.join(" "), limit, type };
}
