import { parseArgs, type ParseArgsConfig } from "node:util";
import { fail, type CliResult } from "./output.js";

type ParsedArgs = {
  values: Record<string, string | boolean | Array<string | boolean> | undefined>;
  positionals: string[];
};

const GLOBAL_OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  "api-base": { type: "string" },
  "search-url": { type: "string" }
} satisfies ParseArgsConfig["options"];

export function parseGlobalFlags(
  argv: string[],
  env: NodeJS.ProcessEnv
): { ok: true; json: boolean; help: boolean; args: string[] } | { ok: false; json: boolean; result: CliResult } {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: GLOBAL_OPTIONS, allowPositionals: true, strict: false, tokens: true });
  } catch (error) {
    return { ok: false, json: argv.includes("--json"), result: argumentError("byrdocs", error) };
  }

  const remove = new Set<number>();
  for (const token of parsed.tokens ?? []) {
    if (token.kind !== "option" || !(token.name in GLOBAL_OPTIONS)) continue;
    remove.add(token.index);
    if ("value" in token && typeof token.value === "string" && !token.inlineValue) remove.add(token.index + 1);
  }

  const apiBase = parsed.values["api-base"];
  if (apiBase === true) return { ok: false, json: Boolean(parsed.values.json), result: missingValue("byrdocs", "--api-base") };
  if (typeof apiBase === "string") env.BYRDOCS_API_BASE = apiBase;

  const searchUrl = parsed.values["search-url"];
  if (searchUrl === true) return { ok: false, json: Boolean(parsed.values.json), result: missingValue("byrdocs", "--search-url") };
  if (typeof searchUrl === "string") env.BYRDOCS_SEARCH_URL = searchUrl;

  return {
    ok: true,
    json: Boolean(parsed.values.json),
    help: Boolean(parsed.values.help),
    args: argv.filter((_arg, index) => !remove.has(index))
  };
}

export function parseCommandArgs(
  command: string,
  args: string[],
  options: ParseArgsConfig["options"] = {}
): { ok: true; parsed: ParsedArgs } | { ok: false; result: CliResult } {
  try {
    const parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
    return { ok: true, parsed: parsed as ParsedArgs };
  } catch (error) {
    return { ok: false, result: argumentError(command, error) };
  }
}

export function positiveNumber(value: unknown, command: string, option: string): { ok: true; value: number } | { ok: false; result: CliResult } {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return { ok: true, value: parsed };
  return { ok: false, result: fail(command, "INVALID_ARGUMENT", `${option} 必须是正数。`, { details: { option, received: value } }) };
}

export function positiveInteger(value: unknown, command: string, option: string): { ok: true; value: number } | { ok: false; result: CliResult } {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  if (Number.isSafeInteger(parsed) && parsed > 0) return { ok: true, value: parsed };
  return { ok: false, result: fail(command, "INVALID_ARGUMENT", `${option} 必须是正整数。`, { details: { option, received: value } }) };
}

function missingValue(command: string, option: string): CliResult {
  return fail(command, "INVALID_ARGUMENT", `${option} 缺少参数值。`, { details: { option } });
}

function argumentError(command: string, error: unknown): CliResult {
  const details = error instanceof Error ? { parser_message: error.message } : { parser_message: String(error) };
  return fail(command, "INVALID_ARGUMENT", "命令行参数不正确。", { details });
}
