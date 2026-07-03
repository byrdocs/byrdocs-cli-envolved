import { readToken, type Runtime } from "./config.js";
import { apiBase, searchEndpoint } from "./http.js";
import { ok, type CliResult, type WarningItem } from "./output.js";

export async function doctorCommand(runtime: Runtime): Promise<CliResult> {
  const [api, search, token] = await Promise.all([check(runtime, apiBase(runtime.env)), check(runtime, searchEndpoint(runtime.env)), hasToken(runtime)]);
  const warnings: WarningItem[] = [];
  if (!api.reachable) warnings.push({ code: "API_UNREACHABLE", message: "主站 API 当前不可达。", suggestions: ["检查网络连接。", "如果使用测试环境，检查 --api-base。"] });
  if (!search.reachable) warnings.push({ code: "SEARCH_API_UNREACHABLE", message: "搜索 API 当前不可达。", suggestions: ["检查网络连接。", "如果使用测试环境，检查 --search-url。"] });
  return ok(
    "doctor",
    {
      cli_version: process.env.npm_package_version || "0.1.0",
      node: process.version,
      api,
      search,
      auth: { token_present: token }
    },
    "环境检查完成。",
    warnings
  );
}

async function check(runtime: Runtime, url: string): Promise<{ url: string; reachable: boolean; status?: number }> {
  try {
    const response = await runtime.fetch(url, { method: "HEAD" });
    return { url, reachable: true, status: response.status };
  } catch {
    return { url, reachable: false };
  }
}

async function hasToken(runtime: Runtime): Promise<boolean> {
  try {
    return Boolean(await readToken(runtime.env));
  } catch {
    return false;
  }
}
