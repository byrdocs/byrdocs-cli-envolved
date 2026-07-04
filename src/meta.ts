import { promises as fs } from "node:fs";
import path from "node:path";
import { Ajv, type AnySchema, type ErrorObject } from "ajv";
import addFormatsModule from "ajv-formats";
import YAML from "yaml";
import type { Runtime } from "./config.js";
import { parseFileRef, type FileRef } from "./file-ref.js";
import { apiUrl } from "./http.js";
import { fail, ok, type CliResult } from "./output.js";

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
  source: "remote";
  schema_url: string;
  raw_schema: unknown;
};

const META_TYPES = ["book", "doc", "test"] as const;

const TYPE_DESCRIPTIONS: Record<MetaType, string> = {
  book: "教材、图书类资料",
  doc: "课件、题库、知识点、答案等课程资料",
  test: "考试原题或答案"
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
    const loaded = await loadSchema(runtime, type, "meta.schema");
    if (!loaded.ok) return loaded.result;
    return ok("meta.schema", { ...loaded.info, shape: loaded.info.raw_schema }, `metadata 类型：${type}`);
  }
  const loaded = [];
  for (const item of META_TYPES) {
    const result = await loadSchema(runtime, item, "meta.schema");
    if (!result.ok) return result.result;
    loaded.push(result.info);
  }
  return ok(
    "meta.schema",
    {
      types: loaded.map((info) => ({
        type: info.type,
        description: info.description,
        filetypes: info.filetypes,
        source: info.source,
        schema_url: info.schema_url
      }))
    },
    "可用类型：book、doc、test"
  );
}

async function init(runtime: Runtime, args: string[]): Promise<CliResult> {
  const input = args[0];
  const type = optionValue(args, "--type");
  const out = optionValue(args, "--out");
  if (!input || !type || !out) return fail("meta.init", "INVALID_ARGUMENT", "用法：byrdocs meta init <file-ref> --type <type> --out <path>");
  if (!isMetaType(type)) return fail("meta.init", "SCHEMA_NOT_FOUND", "未知 metadata 类型。");
  const loaded = await loadSchema(runtime, type, "meta.init");
  if (!loaded.ok) return loaded.result;
  const ref = parseFileRef(input);
  if (!ref) return fail("meta.init", "INVALID_FILE_REF", "文件引用格式不正确。");
  if (!loaded.info.filetypes.includes(ref.ext)) {
    return fail("meta.init", "INVALID_FILE_REF", `${type} 类型不支持 ${ref.ext} 文件。`);
  }

  const doc = templateFromSchema(type, ref, loaded.info.raw_schema);
  try {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, YAML.stringify(doc), "utf8");
  } catch (error) {
    return fail("meta.init", "METADATA_TEMPLATE_FAILED", "无法写入 metadata 模板。", { details: { output_path: out, cause: errorMessage(error) } });
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
    `已生成 metadata 模板：${out}`
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
      diagnostics
    });
  }
  return ok(
    "meta.validate",
    { valid: true, diagnostics, schema_source: loaded.info.source, schema_url: loaded.info.schema_url },
    "metadata 校验通过。"
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
    "metadata 预览已生成。"
  );
}

function templateFromSchema(type: MetaType, ref: FileRef, schema: unknown): unknown {
  const doc: { type: MetaType; id: string; url: string; data: Record<string, unknown> } = {
    type,
    id: ref.md5,
    url: `https://byrdocs.org/files/${ref.key}`,
    data: {}
  };
  const raw = asRecord(schema);
  const dataSchema = asRecord(asRecord(asRecord(raw.properties).data));
  const dataProperties = asRecord(dataSchema.properties);
  for (const field of stringArray(dataSchema.required)) {
    doc.data[field] = templateValue(dataProperties[field], ref);
  }
  return doc;
}

function templateValue(schema: unknown, ref: FileRef): unknown {
  const node = asRecord(schema);
  if (node.enum && stringArray(node.enum).includes(ref.ext)) return ref.ext;
  if (node.type === "array") return [];
  if (node.type === "object") {
    const value: Record<string, unknown> = {};
    const properties = asRecord(node.properties);
    for (const field of stringArray(node.required)) {
      value[field] = templateValue(properties[field], ref);
    }
    return value;
  }
  return "";
}

function validateObject(value: unknown, schema: SchemaInfo): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  (addFormatsModule as unknown as (instance: Ajv) => Ajv)(ajv);
  const validate = ajv.compile(closedSchema(schema.raw_schema) as AnySchema);
  if (!validate(value)) {
    diagnostics.push(...(validate.errors ?? []).map(schemaErrorDiagnostic));
  }
  return diagnostics;
}

async function readYaml(file: string, command: string): Promise<{ ok: true; value: unknown } | { ok: false; result: CliResult }> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    return { ok: false, result: fail(command, "CONFIG_READ_FAILED", "无法读取 YAML 文件。", { details: { path: file, cause: errorMessage(error) } }) };
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
): Promise<{ ok: true; info: SchemaInfo } | { ok: false; result: CliResult }> {
  if (!isRecord(value) || !isMetaType(value.type)) {
    return { ok: false, result: fail(command, "SCHEMA_NOT_FOUND", "未知或缺失 metadata 类型。") };
  }
  return loadSchema(runtime, value.type, command);
}

async function loadSchema(runtime: Runtime, type: MetaType, command: string): Promise<{ ok: true; info: SchemaInfo } | { ok: false; result: CliResult }> {
  const schema_url = schemaUrl(runtime, type);
  try {
    const response = await runtime.fetch(schema_url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text();
    const parsed = YAML.parse(raw);
    return { ok: true, info: schemaInfoFromRemote(type, schema_url, parsed) };
  } catch (error) {
    return {
      ok: false,
      result: fail(command, "SCHEMA_REMOTE_UNAVAILABLE", "无法获取线上 metadata schema，不能进行校验或生成模板。", {
        retryable: true,
        details: { schema_url, cause: errorMessage(error) },
        suggestions: ["检查网络连接和 BYRDocs 服务状态。", "稍后重试，确保本地结果与线上 schema 一致。"]
      })
    };
  }
}

function schemaUrl(runtime: Runtime, type: MetaType): string {
  return apiUrl(runtime.env, `/schema/${type}.yaml`);
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
    description: TYPE_DESCRIPTIONS[type],
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

function closedSchema(schema: unknown): unknown {
  const node = asRecord(schema);
  if (!Object.keys(node).length) return schema;
  const copy: Record<string, unknown> = { ...node };
  const properties = asRecord(copy.properties);

  if ((copy.type === "object" || Object.keys(properties).length > 0) && copy.additionalProperties === undefined) {
    copy.additionalProperties = false;
  }
  if (Object.keys(properties).length > 0) {
    copy.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, closedSchema(value)]));
  }
  if (copy.items !== undefined) {
    copy.items = closedSchema(copy.items);
  }
  return copy;
}

function schemaErrorDiagnostic(error: ErrorObject): Diagnostic {
  const path = jsonPointerToPath(error.instancePath || "");
  const missing = typeof error.params.missingProperty === "string" ? error.params.missingProperty : null;
  if (error.keyword === "required" && missing) {
    return { level: "error", code: "REQUIRED_FIELD_MISSING", path: path === "$" ? `$.${missing}` : `${path}.${missing}`, message: "必填字段缺失或为空。" };
  }
  if (error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string") {
    const key = error.params.additionalProperty;
    return { level: "error", code: "UNKNOWN_FIELD", path: path === "$" ? `$.${key}` : `${path}.${key}`, message: "线上 schema 未声明此字段，CI 会拒绝。" };
  }
  return { level: "error", code: "METADATA_VALIDATION_FAILED", path, message: error.message ?? "不符合线上 schema。" };
}

function jsonPointerToPath(pointer: string): string {
  if (!pointer) return "$";
  return `$${pointer.split("/").slice(1).map((part) => {
    const text = part.replace(/~1/g, "/").replace(/~0/g, "~");
    return /^\d+$/.test(text) ? `[${text}]` : `.${text}`;
  }).join("")}`;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}
