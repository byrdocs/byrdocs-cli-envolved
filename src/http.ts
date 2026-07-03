import type { Runtime } from "./config.js";

export function apiBase(env: NodeJS.ProcessEnv): string {
  return (env.BYRDOCS_API_BASE || "https://byrdocs.org").replace(/\/+$/, "");
}

export function searchEndpoint(env: NodeJS.ProcessEnv): string {
  return env.BYRDOCS_SEARCH_URL || "https://search.byrdocs.org/api/search";
}

export function apiUrl(env: NodeJS.ProcessEnv, pathname: string): string {
  return `${apiBase(env)}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function fetchJson(
  runtime: Runtime,
  url: string,
  init: RequestInit
): Promise<{ response: Response; body: unknown }> {
  const response = await runtime.fetch(url, init);
  return { response, body: await responseJson(response) };
}
