import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, parse } from "node:path";
import { inspect } from "node:util";
import electronLog from "electron-log/main";

export type AppLogLevel = "log" | "info" | "warn" | "error";

const APP_LOG_MAX_SIZE = 5 * 1024 * 1024;
const APP_LOG_ARCHIVE_RETENTION = 10;
const APP_LOG_DAY_CHECK_INTERVAL_MS = 60 * 1000;
const APP_LOG_TIME_ZONE = "Asia/Shanghai";
const APP_LOG_DIR = join(homedir(), ".vetta", "desktop-app", "logs");
const SHOULD_MIRROR_LOGS_TO_CONSOLE = process.env.VETTA_DESKTOP_DEV_URL !== undefined;

let appLoggingConfigured = false;
let consolePatched = false;
let currentLogDateInChina = formatChinaDateKey(new Date());
let dayRotationTimer: NodeJS.Timeout | undefined;

type AppLogger = ReturnType<typeof electronLog.scope>;
type LogFile = ReturnType<typeof electronLog.transports.file.getFile>;
type InternalLogFile = LogFile & {
	reset?: () => void;
};

export function configureAppLogging(): void {
	if (appLoggingConfigured) return;
	appLoggingConfigured = true;

	electronLog.initialize({ preload: false, spyRendererConsole: false });
	electronLog.scope.labelPadding = 18;
	electronLog.transports.file.setAppName("Vetta");
	electronLog.transports.file.fileName = "main.log";
	electronLog.transports.file.resolvePathFn = ({ fileName }) => join(APP_LOG_DIR, fileName ?? "main.log");
	electronLog.transports.file.level = "info";
	electronLog.transports.file.maxSize = APP_LOG_MAX_SIZE;
	electronLog.transports.file.format = ({ data, level, message }) => [
		`[${formatChinaLogTimestamp(message.date)}] [${level}] [${message.scope ?? ""}]`,
		...data,
	];
	electronLog.transports.file.inspectOptions = { depth: 8, breakLength: 160 };
	electronLog.transports.file.sync = true;
	electronLog.transports.file.archiveLogFn = (file) => {
		archiveLogFile(file, "size");
	};
	electronLog.transports.console.level = SHOULD_MIRROR_LOGS_TO_CONSOLE ? "info" : false;
	if (SHOULD_MIRROR_LOGS_TO_CONSOLE) {
		electronLog.transports.console.format = ({ data, level, message }) => [
			`[${formatChinaLogTimestamp(message.date)}] [${level}] [${message.scope ?? ""}]`,
			...data,
		];
	}

	archiveExistingLogFromPreviousChinaDay(electronLog.transports.file.getFile());
	startDayRotationTimer();
}

export function getAppLogger(scope: string): AppLogger {
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

function startDayRotationTimer(): void {
	if (dayRotationTimer !== undefined) return;
	dayRotationTimer = setInterval(() => {
		const today = formatChinaDateKey(new Date());
		if (today === currentLogDateInChina) return;
		currentLogDateInChina = today;
		archiveLogFile(electronLog.transports.file.getFile(), "date");
	}, APP_LOG_DAY_CHECK_INTERVAL_MS);
	dayRotationTimer.unref?.();
}

function archiveExistingLogFromPreviousChinaDay(file: LogFile): void {
	try {
		if (!existsSync(file.path)) return;
		if (file.size <= 0) return;
		const modifiedDate = formatChinaDateKey(statSync(file.path).mtime);
		const today = formatChinaDateKey(new Date());
		currentLogDateInChina = today;
		if (modifiedDate !== today) {
			archiveLogFile(file, "date");
		}
	} catch {
		// Logging must never become a startup failure.
	}
}

function archiveLogFile(file: LogFile, reason: "date" | "size"): void {
	try {
		if (!existsSync(file.path)) return;
		if (statSync(file.path).size <= 0) return;
		const pathParts = parse(file.path);
		const archivePath = getAvailableArchivePath(pathParts.dir, pathParts.name, pathParts.ext, reason);
		renameSync(file.path, archivePath);
		resetLogFile(file);
		deleteOldArchivedLogs(pathParts.dir, pathParts.name, pathParts.ext);
	} catch {
		// If rotation itself fails, keep the app alive and avoid an endless
		// rotation loop on the next write.
		file.clear();
		resetLogFile(file);
	}
}

function resetLogFile(file: LogFile): void {
	const internalFile = file as InternalLogFile;
	internalFile.reset?.();
}

function getAvailableArchivePath(dir: string, name: string, ext: string, reason: "date" | "size"): string {
	const base = join(dir, `${name}.${formatChinaFileTimestamp(new Date())}.${reason}${ext}`);
	if (!existsSync(base)) return base;
	for (let index = 1; index < 1000; index += 1) {
		const candidate = join(dir, `${name}.${formatChinaFileTimestamp(new Date())}.${reason}.${index}${ext}`);
		if (!existsSync(candidate)) return candidate;
	}
	return base;
}

function deleteOldArchivedLogs(dir: string, name: string, ext: string): void {
	try {
		const prefix = `${name}.`;
		const suffix = ext;
		const archivedLogs = readdirSync(dir)
			.filter((filename) => filename.startsWith(prefix) && filename.endsWith(suffix) && filename !== `${name}${ext}`)
			.map((filename) => {
				const path = join(dir, filename);
				return { path, mtimeMs: statSync(path).mtimeMs };
			})
			.sort((left, right) => right.mtimeMs - left.mtimeMs);
		for (const archivedLog of archivedLogs.slice(APP_LOG_ARCHIVE_RETENTION)) {
			unlinkSync(archivedLog.path);
		}
	} catch {
		// Best effort cleanup only.
	}
}

function formatChinaLogTimestamp(date: Date): string {
	return `${formatInChinaTimeZone(date, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
		hourCycle: "h23",
	}).replace(" ", "T")}+08:00`;
}

function formatChinaFileTimestamp(date: Date): string {
	return `${formatInChinaTimeZone(date, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).replace(" ", "T")}+0800`;
}

function formatChinaDateKey(date: Date): string {
	return formatInChinaTimeZone(date, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

function formatInChinaTimeZone(date: Date, options: Intl.DateTimeFormatOptions): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		...options,
		timeZone: APP_LOG_TIME_ZONE,
	}).formatToParts(date);
	const values = new Map(parts.map((part) => [part.type, part.value]));
	const year = values.get("year") ?? "0000";
	const month = values.get("month") ?? "00";
	const day = values.get("day") ?? "00";
	if (options.hour === undefined) {
		return `${year}-${month}-${day}`;
	}
	const hour = values.get("hour") ?? "00";
	const minute = values.get("minute") ?? "00";
	const second = values.get("second") ?? "00";
	const millisecond = values.get("fractionalSecond") ?? "";
	return `${year}-${month}-${day} ${hour}:${minute}:${second}${millisecond ? `.${millisecond}` : ""}`;
}
