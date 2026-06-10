import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, parse } from "node:path";
import { inspect } from "node:util";
import electronLog from "electron-log/main";

export type AppLogLevel = "log" | "info" | "warn" | "error";
export type AppLogType = "main" | "render" | "im";

const APP_LOG_MAX_SIZE = 5 * 1024 * 1024;
const APP_LOG_RETENTION_DAYS = 10;
const APP_LOG_ROTATION_FALLBACK_SIZE = 256 * 1024;
const APP_LOG_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const APP_LOG_TIME_ZONE = "Asia/Shanghai";
const APP_LOG_DIR = join(homedir(), ".vetta", "desktop-app", "logs");
const APP_LOG_TYPES: readonly AppLogType[] = ["main", "render", "im"];
const SHOULD_MIRROR_LOGS_TO_CONSOLE = process.env.VETTA_DESKTOP_DEV_URL !== undefined;

let appLoggingConfigured = false;
let consolePatched = false;
let logCleanupTimer: NodeJS.Timeout | undefined;

type AppLogger = ReturnType<typeof electronLog.scope>;
type ElectronLogger = typeof electronLog;
type LogFile = ReturnType<typeof electronLog.transports.file.getFile>;

const loggers = new Map<AppLogType, ElectronLogger>();

export function configureAppLogging(): void {
	if (appLoggingConfigured) return;
	appLoggingConfigured = true;

	electronLog.initialize({ preload: false, spyRendererConsole: false });
	for (const type of APP_LOG_TYPES) {
		const logger = type === "main" ? electronLog : electronLog.create({ logId: `app-${type}` });
		configureLogger(logger, type);
		loggers.set(type, logger);
	}

	archiveLegacyMainLog();
	cleanupAllLogDirectories();
	startLogCleanupTimer();
}

export function getAppLogger(scope: string, type: AppLogType = "main"): AppLogger {
	configureAppLogging();
	return getLogger(type).scope(scope);
}

export function getAppLogPath(type: AppLogType = "main"): string {
	configureAppLogging();
	return getLogger(type).transports.file.getFile().path;
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

function configureLogger(logger: ElectronLogger, type: AppLogType): void {
	logger.scope.labelPadding = 18;
	logger.transports.file.setAppName("Vetta");
	logger.transports.file.fileName = `${type}.log`;
	logger.transports.file.resolvePathFn = (_variables, message) =>
		join(APP_LOG_DIR, type, `${formatChinaDateKey(message?.date ?? new Date())}.log`);
	logger.transports.file.level = type === "im" ? "debug" : "info";
	logger.transports.file.maxSize = APP_LOG_MAX_SIZE;
	logger.transports.file.format = ({ data, level, message }) => [
		`[${formatChinaLogTimestamp(message.date)}] [${level}] [${message.scope ?? ""}]`,
		...data,
	];
	logger.transports.file.inspectOptions = { depth: 8, breakLength: 160 };
	logger.transports.file.sync = true;
	logger.transports.file.archiveLogFn = archiveLogFile;
	logger.transports.console.level = SHOULD_MIRROR_LOGS_TO_CONSOLE ? "info" : false;
	if (SHOULD_MIRROR_LOGS_TO_CONSOLE) {
		logger.transports.console.format = ({ data, level, message }) => [
			`[${formatChinaLogTimestamp(message.date)}] [${level}] [${message.scope ?? ""}]`,
			...data,
		];
	}
}

function getLogger(type: AppLogType): ElectronLogger {
	const logger = loggers.get(type);
	if (!logger) {
		throw new Error(`App logger is not configured for type: ${type}`);
	}
	return logger;
}

function startLogCleanupTimer(): void {
	if (logCleanupTimer !== undefined) return;
	logCleanupTimer = setInterval(cleanupAllLogDirectories, APP_LOG_CLEANUP_INTERVAL_MS);
	logCleanupTimer.unref?.();
}

function cleanupAllLogDirectories(): void {
	for (const type of APP_LOG_TYPES) {
		deleteExpiredLogs(join(APP_LOG_DIR, type));
	}
}

function archiveLegacyMainLog(): void {
	const legacyPath = join(APP_LOG_DIR, "main.log");
	try {
		if (!existsSync(legacyPath) || statSync(legacyPath).size <= 0) return;
		const targetDir = join(APP_LOG_DIR, "main");
		mkdirSync(targetDir, { recursive: true });
		const archivePath = getAvailableArchivePath(targetDir, "legacy", ".log", "migration");
		renameSync(legacyPath, archivePath);
	} catch {
		// Best effort migration only. New writes never target main.log.
	}
}

function archiveLogFile(file: LogFile): void {
	try {
		if (!existsSync(file.path)) return;
		if (statSync(file.path).size <= 0) return;
		const pathParts = parse(file.path);
		const archivePath = getAvailableArchivePath(pathParts.dir, pathParts.name, pathParts.ext, "size");
		renameSync(file.path, archivePath);
		deleteExpiredLogs(pathParts.dir);
	} catch {
		// Preserve the newest part of the file instead of clearing all logs
		// when a platform temporarily prevents rename.
		cropLogFile(file.path);
	}
}

function cropLogFile(filePath: string): void {
	try {
		const content = readFileSync(filePath);
		const start = Math.max(0, content.length - APP_LOG_ROTATION_FALLBACK_SIZE);
		writeFileSync(filePath, content.subarray(start));
	} catch {
		// Keep the oversized file intact if even the fallback cannot run.
	}
}

function getAvailableArchivePath(dir: string, name: string, ext: string, reason: "size" | "migration"): string {
	const base = join(dir, `${name}.${formatChinaFileTimestamp(new Date())}.${reason}${ext}`);
	if (!existsSync(base)) return base;
	for (let index = 1; index < 1000; index += 1) {
		const candidate = join(dir, `${name}.${formatChinaFileTimestamp(new Date())}.${reason}.${index}${ext}`);
		if (!existsSync(candidate)) return candidate;
	}
	return base;
}

function deleteExpiredLogs(dir: string): void {
	try {
		const datedLogs = readdirSync(dir)
			.filter((filename) => filename.endsWith(".log"))
			.map((filename) => {
				const date = /^(\d{4}-\d{2}-\d{2})(?:\.|$)/.exec(filename)?.[1];
				const path = join(dir, filename);
				return date ? { date, path } : undefined;
			})
			.filter((file): file is { date: string; path: string } => file !== undefined);
		const retainedDates = new Set(
			[...new Set(datedLogs.map((file) => file.date))]
				.sort((left, right) => right.localeCompare(left))
				.slice(0, APP_LOG_RETENTION_DAYS),
		);
		for (const log of datedLogs) {
			if (!retainedDates.has(log.date)) {
				unlinkSync(log.path);
			}
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
