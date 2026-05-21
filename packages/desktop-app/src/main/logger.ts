import { inspect } from "node:util";
import electronLog from "electron-log/main";

export type AppLogLevel = "log" | "info" | "warn" | "error";

const APP_LOG_MAX_SIZE = 5 * 1024 * 1024;
const SHOULD_MIRROR_LOGS_TO_CONSOLE = process.env.VETTA_DESKTOP_DEV_URL !== undefined;

let appLoggingConfigured = false;
let consolePatched = false;

export function configureAppLogging(): void {
	if (appLoggingConfigured) return;
	appLoggingConfigured = true;

	electronLog.initialize({ preload: false, spyRendererConsole: false });
	electronLog.scope.labelPadding = 18;
	electronLog.transports.file.setAppName("Vetta");
	electronLog.transports.file.fileName = "main.log";
	electronLog.transports.file.level = "info";
	electronLog.transports.file.maxSize = APP_LOG_MAX_SIZE;
	electronLog.transports.file.format = "[{iso}] [{level}] [{scope}] {text}";
	electronLog.transports.file.inspectOptions = { depth: 8, breakLength: 160 };
	electronLog.transports.file.sync = true;
	electronLog.transports.console.level = SHOULD_MIRROR_LOGS_TO_CONSOLE ? "info" : false;
	if (SHOULD_MIRROR_LOGS_TO_CONSOLE) {
		electronLog.transports.console.format = "[{iso}] [{level}] [{scope}] {text}";
	}
}

export function getAppLogger(scope: string): ElectronLog.LogFunctions {
	configureAppLogging();
	return electronLog.scope(scope);
}

export function getAppLogPath(): string {
	configureAppLogging();
	return electronLog.transports.file.getFile().path;
}

export function patchConsoleToAppLogger(): void {
	if (consolePatched) return;
	consolePatched = true;

	const logger = getAppLogger("console");
	console.log = (...args: unknown[]) => logger.info(...formatLogArgs(args));
	console.info = (...args: unknown[]) => logger.info(...formatLogArgs(args));
	console.warn = (...args: unknown[]) => logger.warn(...formatLogArgs(args));
	console.error = (...args: unknown[]) => logger.error(...formatLogArgs(args));
}

export function writeAppLog(level: AppLogLevel, scope: string, ...args: unknown[]): void {
	const logger = getAppLogger(scope);
	const formatted = formatLogArgs(args);
	if (level === "error") {
		logger.error(...formatted);
	} else if (level === "warn") {
		logger.warn(...formatted);
	} else {
		logger.info(...formatted);
	}
}

function formatLogArgs(args: unknown[]): string[] {
	return args.map(formatLogArg);
}

// 递归打印 error.cause 链，并附带 code/errno/address/port —— 这是诊断 fetch
// 失败（如 ECONNREFUSED / EHOSTUNREACH / undici "fetch failed"）的关键信息。
function formatErrorChain(err: Error): string {
	const parts: string[] = [err.stack ?? `${err.name}: ${err.message}`];
	const seen = new Set<unknown>([err]);
	let cur: unknown = (err as { cause?: unknown }).cause;
	while (cur && !seen.has(cur)) {
		seen.add(cur);
		if (cur instanceof Error) {
			const meta: string[] = [];
			const anyCur = cur as Error & { code?: string; errno?: number | string; address?: string; port?: number };
			if (anyCur.code) meta.push(`code=${anyCur.code}`);
			if (anyCur.errno !== undefined) meta.push(`errno=${anyCur.errno}`);
			if (anyCur.address) meta.push(`address=${anyCur.address}`);
			if (anyCur.port !== undefined) meta.push(`port=${anyCur.port}`);
			parts.push(
				`  Caused by: ${cur.stack ?? `${cur.name}: ${cur.message}`}${meta.length ? `  [${meta.join(", ")}]` : ""}`,
			);
		} else {
			parts.push(`  Caused by: ${String(cur)}`);
		}
		cur = (cur as { cause?: unknown }).cause;
	}
	return parts.join("\n");
}

function formatLogArg(arg: unknown): string {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return formatErrorChain(arg);
	return inspect(arg, { depth: 8, breakLength: 160 });
}
