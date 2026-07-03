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
  if (result.ok) return [result.text ?? `完成：${result.command}`, warnings].filter(Boolean).join("\n");
  const detail = formatDetails(result.error.details);
  const diagnostics = formatDiagnostics(result.error.diagnostics);
  const suggestions = result.error.suggestions.length ? `建议：\n${result.error.suggestions.map((item) => `- ${item}`).join("\n")}` : "";
  return [`错误(${result.error.code})：${result.error.message}`, detail, diagnostics, suggestions, warnings].filter(Boolean).join("\n");
}

function defaultSuggestions(code: string): string[] {
  switch (code) {
    case "INVALID_ARGUMENT":
      return ["运行 byrdocs help <command> 查看正确用法。", "检查参数名、参数值和位置参数数量。"];
    case "NOT_LOGGED_IN":
      return ["运行 byrdocs auth login 登录后重试。"];
    case "TOKEN_INVALID":
    case "AUTH_TOKEN_SAVE_FAILED":
      return ["重新运行 byrdocs auth login。", "如果问题持续，运行 byrdocs auth logout 后再登录。"];
    case "BUPT_LOGIN_REQUIRED":
      return ["使用 BUPT 统一认证登录，而不是 GitHub 登录。"];
    case "API_UNREACHABLE":
    case "SEARCH_API_UNREACHABLE":
      return ["检查网络连接和 BYRDocs 服务状态。", "如果使用测试环境，检查 --api-base 或 --search-url 是否正确。"];
    case "LOGIN_TIMEOUT":
      return ["确认浏览器中的登录流程已经完成。", "需要更久等待时使用 --timeout-seconds 增大超时时间。"];
    case "LOGIN_EXPIRED":
    case "LOGIN_SESSION_NOT_FOUND":
      return ["重新运行 byrdocs auth login。"];
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
  return `详情：${formatUnknown(details)}`;
}

function formatDiagnostics(diagnostics: unknown[] | undefined): string {
  if (!diagnostics?.length) return "";
  const lines = diagnostics.slice(0, 8).map((item) => `- ${formatUnknown(item)}`);
  const suffix = diagnostics.length > lines.length ? `\n- 还有 ${diagnostics.length - lines.length} 条 diagnostics，使用 --json 查看完整内容。` : "";
  return `诊断：\n${lines.join("\n")}${suffix}`;
}

function formatUnknown(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}
