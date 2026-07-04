export const SCHEMA_VERSION = "byrdocs.cli.v1";

export type WarningItem = {
  code: string;
  message: string;
  details?: unknown;
  suggestions?: string[];
};

export type ErrorItem = {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
  diagnostics?: unknown[];
  suggestions: string[];
};

export type CliResult =
  | {
      schema_version: typeof SCHEMA_VERSION;
      command: string;
      ok: true;
      data: unknown;
      warnings: WarningItem[];
      exitCode: 0;
      text?: string;
    }
  | {
      schema_version: typeof SCHEMA_VERSION;
      command: string;
      ok: false;
      warnings: WarningItem[];
      error: ErrorItem;
      exitCode: number;
      text?: string;
    };

export function ok(command: string, data: unknown, text?: string, warnings: WarningItem[] = []): CliResult {
  return {
    schema_version: SCHEMA_VERSION,
    command,
    ok: true,
    data,
    warnings,
    exitCode: 0,
    text
  };
}

export function fail(
  command: string,
  code: string,
  message: string,
  options: {
    exitCode?: number;
    retryable?: boolean;
    details?: unknown;
    diagnostics?: unknown[];
    suggestions?: string[];
    warnings?: WarningItem[];
    text?: string;
  } = {}
): CliResult {
  return {
    schema_version: SCHEMA_VERSION,
    command,
    ok: false,
    warnings: options.warnings ?? [],
    error: {
      code,
      message,
      ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
      suggestions: options.suggestions ?? defaultSuggestions(code)
    },
    exitCode: options.exitCode ?? 1,
    text: options.text
  };
}

export function toJsonEnvelope(result: CliResult): Record<string, unknown> {
  const { exitCode: _exitCode, text: _text, ...envelope } = result;
  return envelope;
}

export function humanText(result: CliResult): string {
  const warnings = formatWarnings(result.warnings);
  if (result.ok) {
    if (result.command === "help") {
      const helpText = helpDataText(result.data);
      if (helpText) return [helpText, warnings].filter(Boolean).join("\n");
    }
    return [formatSuccess(result.command, result.data, result.text), warnings].filter(Boolean).join("\n");
  }
  const detail = formatDetails(result.error.details);
  const diagnostics = formatDiagnostics(result.error.diagnostics);
  const suggestions = result.error.suggestions.length ? `建议：\n${result.error.suggestions.map((item) => `- ${item}`).join("\n")}` : "";
  return [`错误(${result.error.code})：${result.error.message}`, detail, diagnostics, suggestions, warnings].filter(Boolean).join("\n");
}

function defaultSuggestions(code: string): string[] {
  switch (code) {
    case "INVALID_ARGUMENT":
      return ["检查 details 中的参数名和值。", "运行 byrdocs help <command> 查看正确用法后重试。"];
    case "NOT_LOGGED_IN":
      return ["运行 byrdocs auth login --json 获取登录链接。", "让用户在浏览器完成登录后，运行返回的 poll_command 或 byrdocs auth wait <session-id> --json。"];
    case "TOKEN_INVALID":
    case "AUTH_TOKEN_SAVE_FAILED":
      return ["运行 byrdocs auth logout --json 清理本地登录状态。", "重新运行 byrdocs auth login --json，让用户重新登录。"];
    case "BUPT_LOGIN_REQUIRED":
      return ["运行 byrdocs auth logout --json 后重新登录。", "把登录链接交给用户，并明确需要选择 BUPT 统一认证登录，而不是 GitHub 登录。"];
    case "API_UNREACHABLE":
    case "SEARCH_API_UNREACHABLE":
      return ["检查网络连接和 BYRDocs 服务状态。", "如果使用测试环境，检查 --api-base 或 --search-url 是否正确。"];
    case "LOGIN_TIMEOUT":
      return ["询问用户是否仍在浏览器登录。", "如果用户仍在登录，使用原 session_id 或 poll_command 并加大 --timeout-seconds 重试。", "如果用户已经关闭页面或不确定，重新运行 byrdocs auth login --json 创建新会话。"];
    case "LOGIN_EXPIRED":
    case "LOGIN_SESSION_NOT_FOUND":
      return ["重新运行 byrdocs auth login --json 创建新的登录会话。", "把新的 login_url 展示给用户后，再运行新的 poll_command。"];
    case "FILE_NOT_FOUND":
    case "CONFIG_READ_FAILED":
      return ["检查路径是否存在，以及当前用户是否有读取权限。"];
    case "CONFIG_WRITE_FAILED":
    case "OUTPUT_WRITE_FAILED":
    case "METADATA_TEMPLATE_FAILED":
      return ["检查输出目录是否存在、磁盘空间是否充足，以及当前用户是否有写入权限。"];
    case "UNSUPPORTED_FILE_TYPE":
      return ["只上传 .pdf 或 .zip 文件。"];
    case "UPLOAD_TOO_LARGE":
      return ["压缩文件或拆分后再上传。"];
    case "UPLOAD_FAILED":
      return ["稍后重试上传。", "如果重复失败，运行 byrdocs doctor 检查服务连通性。"];
    case "DOWNLOAD_NOT_FOUND":
      return ["检查 file-ref、md5 或文件 URL 是否正确。", "先用 byrdocs search 搜索确认资料是否存在。"];
    case "DOWNLOAD_UNAUTHORIZED":
      return ["重新运行 byrdocs auth login，并使用 BUPT 统一认证登录。", "如果刚登录过，运行 byrdocs auth status 检查本地 token。"];
    case "DOWNLOAD_FORBIDDEN":
      return ["确认当前账号有下载权限。", "必要时重新使用 BUPT 统一认证登录。"];
    case "DOWNLOAD_FAILED":
      return ["稍后重试下载。", "如果重复失败，运行 byrdocs doctor 检查服务连通性。"];
    case "INVALID_FILE_REF":
      return ["使用 32 位 md5、<md5>.pdf、<md5>.zip 或 https://byrdocs.org/files/<key>。"];
    case "SCHEMA_NOT_FOUND":
      return ["检查 metadata 的 type 是否为 book、doc 或 test。"];
    case "METADATA_VALIDATION_FAILED":
      return ["根据 diagnostics 中的 path 和 message 修改 YAML 后重试。"];
    case "YAML_PARSE_ERROR":
      return ["根据 diagnostics 中的 YAML 解析错误修正文件语法。"];
    default:
      return ["根据 details、diagnostics 和 warnings 排查；如果仍无法定位，运行 byrdocs doctor。"];
  }
}

function formatWarnings(warnings: WarningItem[]): string {
  if (!warnings.length) return "";
  return `警告：\n${warnings.map((item) => `- ${item.message}${item.suggestions?.length ? ` 建议：${item.suggestions.join("；")}` : ""}`).join("\n")}`;
}

function formatDetails(details: unknown): string {
  if (details === undefined) return "";
  return `详情：\n${formatHumanBlock(details)}`;
}

function formatDiagnostics(diagnostics: unknown[] | undefined): string {
  if (!diagnostics?.length) return "";
  const lines = diagnostics.slice(0, 8).map((item) => `- ${formatDiagnostic(item)}`);
  const suffix = diagnostics.length > lines.length ? `\n- 还有 ${diagnostics.length - lines.length} 条 diagnostics，使用 --json 查看完整内容。` : "";
  return `诊断：\n${lines.join("\n")}${suffix}`;
}

function helpDataText(data: unknown): string {
  if (!isRecord(data)) return "";
  return typeof data.text === "string" ? data.text : "";
}

function formatSuccess(command: string, data: unknown, title: string | undefined): string {
  if (command === "doctor") return doctorText(data, title);
  if (command.startsWith("auth.")) return authText(command, data, title);
  if (command === "upload") return uploadText(data, title);
  if (command === "download") return downloadText(data, title);
  if (command === "search") return searchText(data, title);
  if (command === "meta.schema") return metaSchemaText(data, title);
  if (command === "meta.init") return metaInitText(data, title);
  if (command === "meta.validate") return metaValidateText(data, title);
  if (command === "meta.preview") return metaPreviewText(data, title);
  return genericSuccessText(data, title ?? `完成：${command}`);
}

function doctorText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const api = asRecord(record.api);
  const search = asRecord(record.search);
  const auth = asRecord(record.auth);
  return [
    title ?? "环境检查完成。",
    `CLI 版本：${textValue(record.cli_version)}`,
    `Node：${textValue(record.node)}`,
    `主站：${endpointText(api)}`,
    `搜索：${endpointText(search)}`,
    `登录状态：${auth.token_present === true ? "本地已有 token" : "未发现本地 token"}`
  ].join("\n");
}

function authText(command: string, data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  if (record.status === "user_action_required") {
    return [
      "需要在浏览器完成 BYRDocs 登录。",
      `登录链接：${textValue(record.login_url)}`,
      `会话 ID：${textValue(record.session_id)}`,
      `登录完成后运行：${textValue(record.poll_command)}`
    ].join("\n");
  }
  if (record.logged_in === false) {
    if (command === "auth.logout") return title ?? "已退出 BYRDocs 登录。";
    return "当前未登录 BYRDocs。\n下一步：运行 byrdocs auth login 登录。";
  }
  return [
    title ?? "BYRDocs 已登录。",
    `账号：${textValue(record.id)}`,
    `登录来源：${providerText(record.provider)}`,
    `上传权限：${yesNo(record.can_upload)}`,
    `下载权限：${yesNo(record.can_download)}`,
    record.can_download === true ? "下载权限正常。" : "下载资料需要 BUPT 统一认证登录。"
  ].join("\n");
}

function uploadText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const status = record.status === "exists" ? "文件已存在，跳过重复上传。" : title ?? "上传完成。";
  return [
    status,
    `本地文件：${textValue(record.input_path)}`,
    `BYRDocs 文件：${textValue(record.key)}`,
    `MD5：${textValue(record.md5)}`,
    `大小：${formatBytes(numberValue(record.size))}`,
    `下载链接：${textValue(record.url)}`,
    "下一步：生成并填写 metadata，然后提交 PR。"
  ].join("\n");
}

function downloadText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  return [
    title ?? "下载完成。",
    `文件名：${textValue(record.filename)}`,
    `BYRDocs 文件：${textValue(record.key)}`,
    `保存位置：${textValue(record.output_path)}`
  ].join("\n");
}

function searchText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const results = arrayValue(record.results);
  const lines = [
    `搜索完成：${textValue(record.query)}`,
    `返回结果：${results.length} 条${record.type ? `，类型过滤：${textValue(record.type)}` : ""}`
  ];
  if (!results.length) {
    lines.push("没有匹配结果。可以换关键词，或去掉 --type 后重试。");
    return lines.join("\n");
  }
  lines.push("");
  for (const [index, item] of results.entries()) {
    lines.push(formatSearchResult(index + 1, item));
  }
  return lines.join("\n");
}

function metaSchemaText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const types = arrayValue(record.types);
  if (types.length) {
    return ["可用 metadata 类型：", ...types.map((item) => {
      const type = asRecord(item);
      return `- ${textValue(type.type)}：${textValue(type.description)}；支持文件：${listText(type.filetypes)}；schema 来源：${textValue(type.source)}`;
    })].join("\n");
  }
  return [
    title ?? `metadata 类型：${textValue(record.type)}`,
    `说明：${textValue(record.description)}`,
    `支持文件：${listText(record.filetypes)}`,
    `schema 来源：${textValue(record.source)} (${textValue(record.schema_url)})`,
    "必填字段：",
    ...arrayValue(record.required).map((item) => `- ${textValue(item)}`)
  ].join("\n");
}

function metaInitText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const fields = arrayValue(record.needs_user_input);
  return [
    title ?? "已生成 metadata 模板。",
    `模板路径：${textValue(record.path)}`,
    `类型：${textValue(record.type)}`,
    `文件 MD5：${textValue(record.md5)}`,
    `schema 来源：${textValue(record.schema_source)}`,
    fields.length ? "需要补全的字段：" : "没有需要补全的字段。",
    ...fields.map((item) => `- ${fieldRequirementText(item)}`)
  ].join("\n");
}

function metaValidateText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const diagnostics = arrayValue(record.diagnostics);
  return [
    title ?? "metadata 校验通过。",
    `schema 来源：${textValue(record.schema_source)}`,
    diagnostics.length ? "诊断信息：" : "没有诊断信息。",
    ...diagnostics.map((item) => `- ${formatDiagnostic(item)}`)
  ].join("\n");
}

function metaPreviewText(data: unknown, title: string | undefined): string {
  const record = asRecord(data);
  const display = asRecord(record.display);
  const diagnostics = arrayValue(record.diagnostics);
  const unconfirmed = arrayValue(record.unconfirmed_fields);
  return [
    title ?? "metadata 预览已生成。",
    `标题：${textValue(display.title)}`,
    `类型：${textValue(display.type)}`,
    `文件：${textValue(display.id)} (${textValue(display.filetype)})`,
    `链接：${textValue(display.url)}`,
    `PR 状态：${record.ready_for_pr === true ? "可以进入 PR 流程" : "暂不能进入 PR 流程"}`,
    diagnostics.length ? "诊断信息：" : "没有诊断信息。",
    ...diagnostics.map((item) => `- ${formatDiagnostic(item)}`),
    unconfirmed.length ? "需要补全或确认：" : "",
    ...unconfirmed.map((item) => `- ${fieldRequirementText(item)}`)
  ].filter(Boolean).join("\n");
}

function genericSuccessText(data: unknown, title: string): string {
  if (data === undefined || data === null) return title;
  return `${title}\n${formatHumanBlock(data)}`;
}

function formatSearchResult(index: number, item: unknown): string {
  const record = asRecord(item);
  const data = asRecord(record.data);
  const title = stringValue(data.title) ?? stringValue(record.title) ?? stringValue(record.id) ?? "未命名结果";
  const lines = [
    `${index}. ${title}`,
    `   类型：${textValue(record.type)}`,
    `   文件 ID：${textValue(record.id)}`,
    stringValue(data.filetype) ? `   文件格式：${textValue(data.filetype)}` : "",
    `   链接：${textValue(record.url)}`
  ].filter(Boolean);
  const dataFields = Object.entries(data).filter(([key]) => !["title", "filetype"].includes(key));
  if (dataFields.length) lines.push(`   资料信息：${inlineFields(Object.fromEntries(dataFields))}`);
  const extraFields = Object.entries(record).filter(([key]) => !["type", "id", "url", "data"].includes(key));
  if (extraFields.length) lines.push(`   其他信息：${inlineFields(Object.fromEntries(extraFields))}`);
  return lines.join("\n");
}

function fieldRequirementText(item: unknown): string {
  const record = asRecord(item);
  return `${textValue(record.path)}${record.required === true ? "（必填）" : ""}：${textValue(record.reason)}`;
}

function formatDiagnostic(item: unknown): string {
  const record = asRecord(item);
  if (!Object.keys(record).length) return textValue(item);
  const path = stringValue(record.path);
  const message = stringValue(record.message) ?? textValue(item);
  const code = stringValue(record.code);
  const level = stringValue(record.level);
  const prefix = [path, code ? `[${code}]` : "", level ? `(${level})` : ""].filter(Boolean).join(" ");
  return prefix ? `${prefix} ${message}` : message;
}

function formatHumanBlock(value: unknown): string {
  if (Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${formatInlineValue(item)}`).join("\n");
  if (isRecord(value)) return Object.entries(value).map(([key, item]) => `- ${humanLabel(key)}：${formatInlineValue(item)}`).join("\n");
  return formatInlineValue(value);
}

function inlineFields(value: Record<string, unknown>): string {
  return Object.entries(value).map(([key, item]) => `${humanLabel(key)}：${formatInlineValue(item)}`).join("；");
}

function formatInlineValue(value: unknown): string {
  if (value === undefined || value === null) return "无";
  if (typeof value === "string") return value || "无";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(formatInlineValue).join("、") : "无";
  if (isRecord(value)) return inlineFields(value);
  return String(value);
}

function endpointText(value: Record<string, unknown>): string {
  const state = value.reachable === true ? "可访问" : "不可访问";
  const status = value.status === undefined ? "" : `，HTTP ${textValue(value.status)}`;
  return `${state}${status}，${textValue(value.url)}`;
}

function providerText(value: unknown): string {
  if (value === "bupt") return "BUPT 统一认证";
  if (value === "github") return "GitHub";
  return textValue(value);
}

function yesNo(value: unknown): string {
  return value === true ? "是" : "否";
}

function listText(value: unknown): string {
  const items = arrayValue(value).map(textValue);
  return items.length ? items.join("、") : "无";
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim() ? value : "无";
  return value === undefined || value === null ? "无" : String(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MiB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

function humanLabel(key: string): string {
  const labels: Record<string, string> = {
    api_code: "API 代码",
    authors: "作者",
    can_download: "下载权限",
    can_upload: "上传权限",
    cause: "原因",
    command: "命令",
    content: "内容",
    college: "学院",
    course: "课程",
    data: "数据",
    deduplicated: "是否去重",
    description: "说明",
    details: "详情",
    diagnostics: "诊断",
    display: "展示摘要",
    endpoint: "接口",
    end: "结束",
    edition: "版次",
    filetype: "文件格式",
    filetypes: "支持文件",
    filename: "文件名",
    filesize: "文件大小",
    id: "ID",
    input_path: "本地文件",
    isbn: "ISBN",
    key: "文件 key",
    limit: "数量上限",
    logged_in: "登录状态",
    login_url: "登录链接",
    md5: "MD5",
    message: "消息",
    output_path: "保存位置",
    path: "路径",
    poll_command: "轮询命令",
    provider: "登录来源",
    publish_year: "出版年份",
    publisher: "出版社",
    query: "关键词",
    reason: "原因",
    required: "是否必填",
    response: "响应",
    results: "结果",
    schema_source: "schema 来源",
    schema_url: "schema 地址",
    session_id: "会话 ID",
    source: "来源",
    semester: "学期",
    stage: "阶段",
    start: "开始",
    status: "状态",
    time: "时间",
    title: "标题",
    translators: "译者",
    token_present: "本地 token",
    type: "类型",
    url: "链接",
    warnings: "警告"
  };
  return labels[key] ?? key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
