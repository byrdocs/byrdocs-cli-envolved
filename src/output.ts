export const SCHEMA_VERSION = "byrdocs.cli.v1";

export type WarningItem = {
  code: string;
  message: string;
  details?: unknown;
};

export type ErrorItem = {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
  diagnostics?: unknown[];
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
      ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics })
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
  if (result.text) return result.text;
  if (result.ok) return `完成：${result.command}`;
  return `错误(${result.error.code})：${result.error.message}`;
}
