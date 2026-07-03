import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { parseFileRef, type FileRef } from "./file-ref.js";
import { fail, ok, type CliResult } from "./output.js";

type MetaType = "book" | "doc" | "test";
type Diagnostic = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

const TYPES: Record<MetaType, { description: string; required: string[]; filetypes: string[] }> = {
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

export async function metaCommand(args: string[]): Promise<CliResult> {
  const sub = args[0];
  if (sub === "schema") return schema(args.slice(1));
  if (sub === "init") return init(args.slice(1));
  if (sub === "validate") return validate(args.slice(1));
  if (sub === "preview") return preview(args.slice(1));
  return fail("meta", "INVALID_ARGUMENT", "未知 meta 子命令。");
}

function schema(args: string[]): CliResult {
  const type = optionValue(args, "--type");
  if (type) {
    if (!isMetaType(type)) return fail("meta.schema", "SCHEMA_NOT_FOUND", "未知 metadata 类型。");
    return ok("meta.schema", { type, ...TYPES[type], shape: schemaShape(type) }, `metadata 类型：${type}`);
  }
  return ok(
    "meta.schema",
    {
      types: Object.entries(TYPES).map(([type, info]) => ({
        type,
        description: info.description,
        filetypes: info.filetypes
      }))
    },
    "可用类型：book、doc、test"
  );
}

async function init(args: string[]): Promise<CliResult> {
  const input = args[0];
  const type = optionValue(args, "--type");
  const out = optionValue(args, "--out");
  if (!input || !type || !out) return fail("meta.init", "INVALID_ARGUMENT", "用法：byrdocs meta init <file-ref> --type <type> --out <path>");
  if (!isMetaType(type)) return fail("meta.init", "SCHEMA_NOT_FOUND", "未知 metadata 类型。");
  const ref = parseFileRef(input);
  if (!ref) return fail("meta.init", "INVALID_FILE_REF", "文件引用格式不正确。");
  if (!TYPES[type].filetypes.includes(ref.ext)) {
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
      needs_user_input: needsUserInput(type)
    },
    `已生成 metadata 模板：${out}`
  );
}

async function validate(args: string[]): Promise<CliResult> {
  const file = args[0];
  if (!file) return fail("meta.validate", "INVALID_ARGUMENT", "缺少 YAML 文件路径。");
  const parsed = await readYaml(file, "meta.validate");
  if (!parsed.ok) return parsed.result;
  const diagnostics = validateObject(parsed.value);
  const errors = diagnostics.filter((item) => item.level === "error");
  if (errors.length) {
    return fail("meta.validate", "METADATA_VALIDATION_FAILED", "metadata 存在校验错误，请根据 diagnostics 修正后重试。", {
      retryable: true,
      diagnostics
    });
  }
  return ok("meta.validate", { valid: true, diagnostics }, "metadata 校验通过。");
}

async function preview(args: string[]): Promise<CliResult> {
  const file = args[0];
  if (!file) return fail("meta.preview", "INVALID_ARGUMENT", "缺少 YAML 文件路径。");
  const parsed = await readYaml(file, "meta.preview");
  if (!parsed.ok) return parsed.result;
  const diagnostics = validateObject(parsed.value);
  const unconfirmed = unconfirmedFields(parsed.value);
  const hasErrors = diagnostics.some((item) => item.level === "error");
  return ok(
    "meta.preview",
    {
      display: display(parsed.value),
      diagnostics,
      unconfirmed_fields: unconfirmed,
      ready_for_pr: !hasErrors && unconfirmed.length === 0
    },
    "metadata 预览已生成。"
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

function validateObject(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [{ level: "error", code: "METADATA_VALIDATION_FAILED", path: "$", message: "YAML 顶层必须是对象。" }];
  }
  const type = value.type;
  if (!isMetaType(type)) {
    return [{ level: "error", code: "SCHEMA_NOT_FOUND", path: "$.type", message: "未知或缺失 metadata 类型。" }];
  }
  for (const field of TYPES[type].required) {
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
  if (typeof filetype === "string" && !TYPES[type].filetypes.includes(filetype)) {
    diagnostics.push({ level: "error", code: "METADATA_VALIDATION_FAILED", path: "$.data.filetype", message: `${type} 类型不支持 ${filetype} 文件。` });
  }
  if (type === "test") {
    const filesize = pathValue(value, "$.data.filesize");
    if (typeof filesize !== "number" || filesize <= 0) {
      diagnostics.push({ level: "error", code: "REQUIRED_FIELD_MISSING", path: "$.data.filesize", message: "filesize 必须是正数。" });
    }
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

function unconfirmedFields(value: unknown): Array<{ path: string; required: boolean; reason: string }> {
  if (!isRecord(value) || !isMetaType(value.type)) return [];
  return TYPES[value.type].required
    .filter((field) => isEmpty(pathValue(value, field)))
    .map((field) => ({ path: field, required: true, reason: "必填字段为空" }));
}

function needsUserInput(type: MetaType): Array<{ path: string; required: boolean; reason: string }> {
  return TYPES[type].required
    .filter((field) => !["$.id", "$.url", "$.data.filetype"].includes(field))
    .map((field) => ({ path: field, required: true, reason: "必填字段为空" }));
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

function isMetaType(value: unknown): value is MetaType {
  return value === "book" || value === "doc" || value === "test";
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}
