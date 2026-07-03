import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Runtime } from "./config.js";
import { parseFileRef, type FileRef } from "./file-ref.js";
import { apiUrl } from "./http.js";
import { fail, ok, type CliResult, type WarningItem } from "./output.js";

type MetaType = "book" | "doc" | "test";
type Diagnostic = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};
type SchemaInfo = {
  type: MetaType;
  description: string;
  required: string[];
  filetypes: string[];
  source: "remote" | "fallback";
  schema_url: string;
  raw_schema?: unknown;
};

const META_TYPES = ["book", "doc", "test"] as const;

const FALLBACK_TYPES: Record<MetaType, { description: string; required: string[]; filetypes: string[] }> = {
  book: {
    description: "教材、图书类资料",
    required: ["$.id", "$.url", "$.data.title", "$.data.authors", "$.data.isbn", "$.data.filetype"],
    filetypes: ["pdf"]
  },
  doc: {
    description: "课件、题库、知识点、答案等课程资料",
    required: ["$.id", "$.url", "$.data.title", "$.data.course", "$.data.content", "$.data.filetype"],
    filetypes: ["pdf", "zip"]
  },
  test: {
    description: "考试原题或答案",
    required: [
      "$.id",
      "$.url",
      "$.data.title",
      "$.data.course.name",
      "$.data.time.start",
      "$.data.time.end",
      "$.data.content",
      "$.data.filetype",
      "$.data.filesize"
    ],
    filetypes: ["pdf"]
  }
};

export async function metaCommand(runtime: Runtime, args: string[]): Promise<CliResult> {
  const sub = args[0];
  if (sub === "schema") return schema(runtime, args.slice(1));
  if (sub === "init") return init(runtime, args.slice(1));
  if (sub === "validate") return validate(runtime, args.slice(1));
  if (sub === "preview") return preview(runtime, args.slice(1));
  return fail("meta", "INVALID_ARGUMENT", "未知 meta 子命令。");
}

async function schema(runtime: Runtime, args: string[]): Promise<CliResult> {
  const type = optionValue(args, "--type");
  if (type) {
    if (!isMetaType(type)) return fail("meta.schema", "SCHEMA_NOT_FOUND", "未知 metadata 类型。");
    const loaded = await loadSchema(runtime, type);
    return ok("meta.schema", { ...loaded.info, shape: loaded.info.raw_schema ?? schemaShape(type) }, `metadata 类型：${type}`, loaded.warnings);
  }
  const loaded = await Promise.all(META_TYPES.map((item) => loadSchema(runtime, item)));
  return ok(
    "meta.schema",
    {
      types: loaded.map(({ info }) => ({
        type: info.type,
        description: info.description,
        filetypes: info.filetypes,
        source: info.source,
        schema_url: info.schema_url
      }))
    },
    "可用类型：book、doc、test",
    loaded.flatMap((item) => item.warnings)
  );
}

async function init(runtime: Runtime, args: string[]): Promise<CliResult> {
  const input = args[0];
  const type = optionValue(args, "--type");
  const out = optionValue(args, "--out");
  if (!input || !type || !out) return fail("meta.init", "INVALID_ARGUMENT", "用法：byrdocs meta init <file-ref> --type <type> --out <path>");
  if (!isMetaType(type)) return fail("meta.init", "SCHEMA_NOT_FOUND", "未知 metadata 类型。");
  const loaded = await loadSchema(runtime, type);
  const ref = parseFileRef(input);
  if (!ref) return fail("meta.init", "INVALID_FILE_REF", "文件引用格式不正确。");
  if (!loaded.info.filetypes.includes(ref.ext)) {
    return fail("meta.init", "INVALID_FILE_REF", `${type} 类型不支持 ${ref.ext} 文件。`);
  }

  const doc = template(type, ref);
  try {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, YAML.stringify(doc), "utf8");
  } catch {
    return fail("meta.init", "METADATA_TEMPLATE_FAILED", "无法写入 metadata 模板。");
  }
  return ok(
    "meta.init",
    {
      path: out,
      type,
      md5: ref.md5,
      schema_source: loaded.info.source,
      schema_url: loaded.info.schema_url,
      needs_user_input: needsUserInput(loaded.info)
    },
    `已生成 metadata 模板：${out}`,
    loaded.warnings
  );
}

async function validate(runtime: Runtime, args: string[]): Promise<CliResult> {
  const file = args[0];
  if (!file) return fail("meta.validate", "INVALID_ARGUMENT", "缺少 YAML 文件路径。");
  const parsed = await readYaml(file, "meta.validate");
  if (!parsed.ok) return parsed.result;
  const loaded = await schemaForValue(runtime, parsed.value, "meta.validate");
  if (!loaded.ok) return loaded.result;
  const diagnostics = validateObject(parsed.value, loaded.info);
  const errors = diagnostics.filter((item) => item.level === "error");
  if (errors.length) {
    return fail("meta.validate", "METADATA_VALIDATION_FAILED", "metadata 存在校验错误，请根据 diagnostics 修正后重试。", {
      retryable: true,
      diagnostics,
      warnings: loaded.warnings
    });
  }
  return ok(
    "meta.validate",
    { valid: true, diagnostics, schema_source: loaded.info.source, schema_url: loaded.info.schema_url },
    "metadata 校验通过。",
    loaded.warnings
  );
}

async function preview(runtime: Runtime, args: string[]): Promise<CliResult> {
  const file = args[0];
  if (!file) return fail("meta.preview", "INVALID_ARGUMENT", "缺少 YAML 文件路径。");
  const parsed = await readYaml(file, "meta.preview");
  if (!parsed.ok) return parsed.result;
  const loaded = await schemaForValue(runtime, parsed.value, "meta.preview");
  if (!loaded.ok) return loaded.result;
  const diagnostics = validateObject(parsed.value, loaded.info);
  const unconfirmed = unconfirmedFields(parsed.value, loaded.info);
  const hasErrors = diagnostics.some((item) => item.level === "error");
  return ok(
    "meta.preview",
    {
      display: display(parsed.value),
      diagnostics,
      unconfirmed_fields: unconfirmed,
      ready_for_pr: !hasErrors && unconfirmed.length === 0,
      schema_source: loaded.info.source,
      schema_url: loaded.info.schema_url
    },
    "metadata 预览已生成。",
    loaded.warnings
  );
}

function template(type: MetaType, ref: FileRef): unknown {
  const base = {
    type,
    id: ref.md5,
    url: `https://byrdocs.org/files/${ref.key}`
  };
  if (type === "book") {
    return { ...base, data: { title: "", authors: [], translators: [], edition: "", publisher: "", publish_year: "", isbn: [], filetype: "pdf" } };
  }
  if (type === "doc") {
    return { ...base, data: { title: "", filetype: ref.ext, course: [{ type: "", name: "" }], content: [] } };
  }
  return {
    ...base,
    data: {
      title: "",
      college: [],
      course: { type: "", name: "" },
      time: { start: "", end: "", semester: "", stage: "" },
      filetype: "pdf",
      content: [],
      filesize: null
    }
  };
}

function schemaShape(type: MetaType): unknown {
  if (type === "book") {
    return { type: "book", id: "md5", url: "https://byrdocs.org/files/<md5>.pdf", data: { title: "string", authors: "string[]", isbn: "string[]", filetype: "pdf" } };
  }
  if (type === "doc") {
    return { type: "doc", id: "md5", url: "https://byrdocs.org/files/<md5>.<pdf|zip>", data: { title: "string", filetype: "pdf|zip", course: "array", content: "array" } };
  }
  return { type: "test", id: "md5", url: "https://byrdocs.org/files/<md5>.pdf", data: { title: "string", course: { name: "string" }, time: { start: "string", end: "string" }, content: "array", filesize: "number", filetype: "pdf" } };
}

function validateObject(value: unknown, schema: SchemaInfo): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [{ level: "error", code: "METADATA_VALIDATION_FAILED", path: "$", message: "YAML 顶层必须是对象。" }];
  }
  const type = value.type;
  if (!isMetaType(type)) {
    return [{ level: "error", code: "SCHEMA_NOT_FOUND", path: "$.type", message: "未知或缺失 metadata 类型。" }];
  }
  if (type !== schema.type) {
    diagnostics.push({ level: "error", code: "SCHEMA_NOT_FOUND", path: "$.type", message: "metadata 类型与 schema 不一致。" });
  }
  for (const field of schema.required) {
    if (isEmpty(pathValue(value, field))) {
      diagnostics.push({ level: "error", code: "REQUIRED_FIELD_MISSING", path: field, message: "必填字段为空。" });
    }
  }
  const id = typeof value.id === "string" ? value.id : "";
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    diagnostics.push({ level: "error", code: "INVALID_FILE_REF", path: "$.id", message: "id 必须是 32 位 md5。" });
  }
  const url = typeof value.url === "string" ? value.url : "";
  const ref = parseFileRef(url);
  if (!ref) {
    diagnostics.push({ level: "error", code: "INVALID_FILE_REF", path: "$.url", message: "url 必须是 https://byrdocs.org/files/<md5>.<pdf|zip>。" });
  } else {
    if (id && ref.md5 !== id.toLowerCase()) {
      diagnostics.push({ level: "error", code: "KEY_MD5_MISMATCH", path: "$.url", message: "url 中的 md5 与 id 不一致。" });
    }
    const filetype = pathValue(value, "$.data.filetype");
    if (typeof filetype === "string" && filetype !== ref.ext) {
      diagnostics.push({ level: "error", code: "KEY_MD5_MISMATCH", path: "$.data.filetype", message: "filetype 与 url 扩展名不一致。" });
    }
  }
  const filetype = pathValue(value, "$.data.filetype");
  if (typeof filetype === "string" && !schema.filetypes.includes(filetype)) {
    diagnostics.push({ level: "error", code: "METADATA_VALIDATION_FAILED", path: "$.data.filetype", message: `${type} 类型不支持 ${filetype} 文件。` });
  }
  return diagnostics;
}

async function readYaml(file: string, command: string): Promise<{ ok: true; value: unknown } | { ok: false; result: CliResult }> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { ok: false, result: fail(command, "CONFIG_READ_FAILED", "无法读取 YAML 文件。") };
  }
  const doc = YAML.parseDocument(raw);
  if (doc.errors.length) {
    return {
      ok: false,
      result: fail(command, "YAML_PARSE_ERROR", "YAML 语法错误。", {
        diagnostics: doc.errors.map((error) => ({ level: "error", code: "YAML_PARSE_ERROR", message: error.message }))
      })
    };
  }
  return { ok: true, value: doc.toJSON() };
}

function display(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.data)) return {};
  return {
    type: value.type,
    id: value.id,
    title: value.data.title,
    filetype: value.data.filetype,
    url: value.url
  };
}

function unconfirmedFields(value: unknown, schema: SchemaInfo): Array<{ path: string; required: boolean; reason: string }> {
  if (!isRecord(value) || !isMetaType(value.type)) return [];
  return schema.required
    .filter((field) => isEmpty(pathValue(value, field)))
    .map((field) => ({ path: field, required: true, reason: "必填字段为空" }));
}

function needsUserInput(schema: SchemaInfo): Array<{ path: string; required: boolean; reason: string }> {
  return schema.required
    .filter((field) => !["$.id", "$.url", "$.type", "$.data", "$.data.filetype"].includes(field))
    .map((field) => ({ path: field, required: true, reason: "必填字段为空" }));
}

async function schemaForValue(
  runtime: Runtime,
  value: unknown,
  command: string
): Promise<{ ok: true; info: SchemaInfo; warnings: WarningItem[] } | { ok: false; result: CliResult }> {
  if (!isRecord(value) || !isMetaType(value.type)) {
    return { ok: false, result: fail(command, "SCHEMA_NOT_FOUND", "未知或缺失 metadata 类型。") };
  }
  return { ok: true, ...(await loadSchema(runtime, value.type)) };
}

async function loadSchema(runtime: Runtime, type: MetaType): Promise<{ info: SchemaInfo; warnings: WarningItem[] }> {
  const schema_url = schemaUrl(runtime, type);
  try {
    const response = await runtime.fetch(schema_url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text();
    const parsed = YAML.parse(raw);
    return { info: schemaInfoFromRemote(type, schema_url, parsed), warnings: [] };
  } catch (error) {
    const fallback = fallbackSchema(type, schema_url);
    return {
      info: fallback,
      warnings: [
        {
          code: "SCHEMA_REMOTE_UNAVAILABLE",
          message: "无法获取最新 metadata schema，已使用内置兜底 schema。",
          details: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}

function schemaUrl(runtime: Runtime, type: MetaType): string {
  return apiUrl(runtime.env, `/schema/${type}.yaml`);
}

function fallbackSchema(type: MetaType, schema_url: string): SchemaInfo {
  return { type, ...FALLBACK_TYPES[type], source: "fallback", schema_url, raw_schema: schemaShape(type) };
}

function schemaInfoFromRemote(type: MetaType, schema_url: string, raw_schema: unknown): SchemaInfo {
  const raw = asRecord(raw_schema);
  const properties = asRecord(raw.properties);
  const data = asRecord(properties.data);
  const dataProperties = asRecord(data.properties);
  const filetype = asRecord(dataProperties.filetype);
  const filetypes = stringArray(filetype.enum);
  if (!filetypes.length) throw new Error("schema missing data.filetype enum");
  return {
    type,
    description: FALLBACK_TYPES[type].description,
    required: collectRequired(raw, "$"),
    filetypes,
    source: "remote",
    schema_url,
    raw_schema
  };
}

function collectRequired(schema: unknown, basePath: string): string[] {
  const node = asRecord(schema);
  const properties = asRecord(node.properties);
  const required = stringArray(node.required);
  const paths: string[] = [];
  for (const field of required) {
    const path = basePath === "$" ? `$.${field}` : `${basePath}.${field}`;
    paths.push(path);
    const child = asRecord(properties[field]);
    if (child.type === "object") {
      paths.push(...collectRequired(child, path));
    }
  }
  return Array.from(new Set(paths));
}

function pathValue(value: unknown, pointer: string): unknown {
  return pointer
    .replace(/^\$\./, "")
    .split(".")
    .reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isMetaType(value: unknown): value is MetaType {
  return value === "book" || value === "doc" || value === "test";
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}
