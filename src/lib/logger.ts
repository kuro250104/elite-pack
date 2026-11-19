/**
 * Minimal structured logger, without dependency.
 * - Production: one JSON object per line (machine-readable by any log collector).
 * - Development: readable lines, with the full details needed to debug.
 * The level comes from LOG_LEVEL (debug, info, warn, error); default: info in production, debug otherwise.
 * Secrets are masked in every message and field before writing.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const labels: Record<LogLevel, string> = { debug: "DEBUG", info: "INFO", warn: "AVERTISSEMENT", error: "ERREUR" };
const sensitiveKey = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|database_?url|connection_?string/i;
const redactions: [RegExp, string][] = [
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'@/]*@/gi, "$1://***@"],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 ***"],
  // TheSportsDB carries its API key in the URL path: /api/v1/json/<key>/endpoint.
  [/(\/api\/v\d+\/json\/)[^/\s?#]+/gi, "$1***"],
  [/\b(password|passwd|pwd|secret|token|api[-_]?key)\s*[=:]\s*[^\s,;"'&]+/gi, "$1=***"],
  [/\b((?:__Secure-|__Host-)?authjs\.[\w.-]+)=[^;\s]+/gi, "$1=***"],
];

export function redact(value: string): string {
  return redactions.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redact(value);
  if (value === null || typeof value !== "object") return typeof value === "bigint" ? value.toString() : value;
  if (depth > 5) return "[profondeur maximale]";
  if (value instanceof Error) return sanitize(serializeError(value), depth + 1);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, sensitiveKey.test(key) ? "***" : sanitize(item, depth + 1)]));
}

/** Error details for the logs: name, message, Prisma or system code, cause chain and stack. */
export function serializeError(error: unknown): LogFields {
  if (!(error instanceof Error)) return { value: String(error) };
  const details: LogFields = { name: error.name, message: error.message };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") details.code = code;
  if (error.stack) details.stack = error.stack.split("\n").slice(0, 12).join("\n");
  if (error.cause !== undefined) details.cause = error.cause instanceof Error ? serializeError(error.cause) : String(error.cause);
  return details;
}

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in order) return order[configured as LogLevel];
  return process.env.NODE_ENV === "production" ? order.info : order.debug;
}

function write(level: LogLevel, message: string, fields: LogFields = {}) {
  if (order[level] < threshold()) return;
  const safeFields = sanitize(fields) as LogFields;
  const output = level === "error" || level === "warn" ? console.error : console.log;
  if (process.env.NODE_ENV === "production") {
    output(JSON.stringify({ time: new Date().toISOString(), level, message: redact(message), ...safeFields }));
    return;
  }
  // Development: the stack is printed on its own lines, so file names and line numbers stay clickable.
  const { error, ...others } = safeFields as LogFields & { error?: LogFields };
  const { stack, ...errorDetails } = error ?? {};
  const shown = error ? { ...others, error: errorDetails } : others;
  output(`[${labels[level]}] ${redact(message)}${Object.keys(shown).length ? " " + JSON.stringify(shown, null, 2) : ""}`);
  if (typeof stack === "string") output(stack);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
