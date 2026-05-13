// 主进程文件日志：把 console.* / 未捕获异常 / fetch 失败原因持久化到磁盘，
// 方便诊断打包后的 Vetta.app 在 Finder 双击启动时遇到的网络/环境问题
// （这些场景下没有 stderr 终端，运行时错误堆栈本来会丢失）。
//
// macOS: ~/Library/Logs/Vetta/main.log
// Linux: ~/.config/Vetta/logs/main.log
// Windows: %APPDATA%\Vetta\logs\main.log

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { format } from "node:util";

const MAX_BYTES = 5 * 1024 * 1024;
let installed = false;
let logFilePath = "";

function defaultLogDir(): string {
	if (process.platform === "darwin") return join(homedir(), "Library", "Logs", "Vetta");
	if (process.platform === "win32") return join(process.env.APPDATA || homedir(), "Vetta", "logs");
	return join(homedir(), ".config", "Vetta", "logs");
}

function formatError(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	const parts: string[] = [err.stack || `${err.name}: ${err.message}`];
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
				`  Caused by: ${cur.stack || `${cur.name}: ${cur.message}`}${meta.length ? `  [${meta.join(", ")}]` : ""}`,
			);
		} else {
			parts.push(`  Caused by: ${String(cur)}`);
		}
		cur = (cur as { cause?: unknown }).cause;
	}
	return parts.join("\n");
}

function rotate(): void {
	try {
		const st = statSync(logFilePath);
		if (st.size > MAX_BYTES) {
			renameSync(logFilePath, `${logFilePath}.1`);
		}
	} catch {
		// fresh file, nothing to rotate
	}
}

function write(level: string, args: unknown[]): void {
	const rendered = args
		.map((a) => (a instanceof Error ? formatError(a) : typeof a === "string" ? a : format(a)))
		.join(" ");
	const line = `[${new Date().toISOString()}] [${level}] ${rendered}\n`;
	try {
		appendFileSync(logFilePath, line);
	} catch {
		// disk full / permission — swallow so logging never crashes the app
	}
}

function patchFetch(): void {
	const orig = globalThis.fetch;
	if (typeof orig !== "function") return;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		try {
			return await orig(input, init);
		} catch (err) {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
			write("fetch_error", [`url=${url}`, err]);
			throw err;
		}
	}) as typeof fetch;
}

function doInstall(): string {
	if (installed) return logFilePath;
	installed = true;

	const dir = defaultLogDir();
	try {
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	} catch {
		// fall back to stderr only
	}
	logFilePath = join(dir, "main.log");
	rotate();

	const origLog = console.log.bind(console);
	const origWarn = console.warn.bind(console);
	const origError = console.error.bind(console);
	const origInfo = console.info.bind(console);
	console.log = (...a: unknown[]) => {
		write("log", a);
		origLog(...a);
	};
	console.info = (...a: unknown[]) => {
		write("info", a);
		origInfo(...a);
	};
	console.warn = (...a: unknown[]) => {
		write("warn", a);
		origWarn(...a);
	};
	console.error = (...a: unknown[]) => {
		write("error", a);
		origError(...a);
	};

	process.on("uncaughtException", (err) => {
		write("uncaughtException", [err]);
	});
	process.on("unhandledRejection", (reason) => {
		write("unhandledRejection", [reason]);
	});

	patchFetch();

	write("startup", [
		"Vetta main process started",
		JSON.stringify(
			{
				version: process.env.npm_package_version,
				platform: process.platform,
				arch: process.arch,
				node: process.versions.node,
				electron: process.versions.electron,
				execPath: process.execPath,
				cwd: process.cwd(),
				argv: process.argv,
				env: {
					PATH: process.env.PATH,
					SHELL: process.env.SHELL,
					HOME: process.env.HOME,
					LANG: process.env.LANG,
					HTTP_PROXY: process.env.HTTP_PROXY ?? process.env.http_proxy,
					HTTPS_PROXY: process.env.HTTPS_PROXY ?? process.env.https_proxy,
					NO_PROXY: process.env.NO_PROXY ?? process.env.no_proxy,
					ALL_PROXY: process.env.ALL_PROXY ?? process.env.all_proxy,
					VETTA_SERVER_URL: process.env.VETTA_SERVER_URL,
				},
			},
			null,
			2,
		),
	]);

	return logFilePath;
}

export function getLogFilePath(): string {
	return logFilePath;
}

// 顶层副作用：模块被任何 import 加载时立即安装，确保覆盖所有后续 import 的副作用
// （ESM import 是 hoist 的，把 install 调用写在 main.ts 的中间没有任何效果）。
doInstall();
