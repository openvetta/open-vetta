import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { app } from "electron";

type ConsoleLevel = "log" | "info" | "warn" | "error";

let diagnosticsInstalled = false;
let diagnosticsLogPath: string | undefined;

function resolveDiagnosticsLogPath(): string {
	if (diagnosticsLogPath) return diagnosticsLogPath;
	const baseDir = app.isReady() ? app.getPath("logs") : join(tmpdir(), "vetta-desktop-logs");
	mkdirSync(baseDir, { recursive: true });
	diagnosticsLogPath = join(baseDir, "main.log");
	return diagnosticsLogPath;
}

function formatArg(arg: unknown): string {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return `${arg.stack ?? arg.message}`;
	return inspect(arg, { depth: 8, breakLength: 160 });
}

export function writeDiagnosticLog(level: ConsoleLevel, ...args: unknown[]): void {
	try {
		const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatArg).join(" ")}\n`;
		appendFileSync(resolveDiagnosticsLogPath(), line, "utf8");
	} catch {
		// Logging must never become a startup failure.
	}
}

export function getDiagnosticsLogPath(): string {
	return resolveDiagnosticsLogPath();
}

export function installMainDiagnostics(): void {
	if (diagnosticsInstalled) return;
	diagnosticsInstalled = true;

	const originalConsole: Pick<Console, ConsoleLevel> = {
		log: console.log.bind(console),
		info: console.info.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	for (const level of ["log", "info", "warn", "error"] as const) {
		console[level] = (...args: unknown[]) => {
			writeDiagnosticLog(level, ...args);
			originalConsole[level](...args);
		};
	}

	process.on("uncaughtException", (error) => {
		console.error("[main] uncaughtException", error);
	});

	process.on("unhandledRejection", (reason) => {
		console.error("[main] unhandledRejection", reason);
	});

	app.on("render-process-gone", (_event, webContents, details) => {
		console.error("[electron] render-process-gone", {
			id: webContents.id,
			url: webContents.getURL(),
			details,
		});
	});

	app.on("child-process-gone", (_event, details) => {
		console.error("[electron] child-process-gone", details);
	});

	app.on("will-quit", (_event) => {
		console.log("[app] will-quit");
	});

	app.on("quit", (_event, exitCode) => {
		writeDiagnosticLog("log", "[app] quit", { exitCode });
	});
}
