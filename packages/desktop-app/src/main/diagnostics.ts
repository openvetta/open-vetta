import { createSocket } from "node:dgram";
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

// 递归打印 error.cause 链，并附带 code/errno/address/port —— 这是诊断 fetch
// 失败（如 ECONNREFUSED / EHOSTUNREACH / undici "fetch failed"）的关键信息，
// 没有 cause 链就只能看到 "Connection error." 这种顶层占位文案，根因丢失。
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

function formatArg(arg: unknown): string {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return formatErrorChain(arg);
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

// macOS 14+/15+ 的 Local Network Privacy 在 app 第一次访问局域网（192.168.x、
// 10.x、mDNS 等）时会弹"允许查找并连接本地网络上的设备"对话框，未授权时所有
// 局域网请求被静默拒绝并返回 EHOSTUNREACH（errno -65），表现为 OpenAI / Anthropic
// SDK 抛 "Connection error."。
//
// 触发弹窗的条件：(1) Info.plist 必须声明 NSLocalNetworkUsageDescription +
// NSBonjourServices，(2) app 必须实际发起 Bonjour 浏览或 mDNS 多播。Electron
// 默认两个都不做，所以即使 Info.plist 写好了也不会弹窗，TCC 表里也没有 Vetta
// 的记录，用户无法去系统设置里手动开启 —— 进入死锁。
//
// 这里在主进程启动时主动向 224.0.0.251:5353（mDNS 多播地址）发一个空 UDP 包，
// 让 macOS 把 Vetta 识别为"需要本地网络"的 app，从而触发权限弹窗或把 Vetta
// 加入系统设置 → 隐私与安全性 → 本地网络的列表，让用户能手动授权。一旦授权，
// 后续 192.168.x 单播请求也会被放行。
function triggerLocalNetworkPermission(): void {
	if (process.platform !== "darwin") return;
	try {
		const socket = createSocket({ type: "udp4", reuseAddr: true });
		socket.on("error", (err) => {
			console.warn("[local-network-probe] mDNS probe socket error", err);
			try {
				socket.close();
			} catch {
				// already closed
			}
		});
		socket.bind(0, () => {
			try {
				socket.setMulticastTTL(1);
			} catch {
				// best effort
			}
			// 最小 DNS query header（12 字节全 0），mDNS 解析方会忽略，但内核会
			// 把这次多播发送记为本地网络访问 → 触发 TCC 检查。
			const probe = Buffer.alloc(12, 0);
			socket.send(probe, 5353, "224.0.0.251", (err) => {
				if (err) {
					console.warn("[local-network-probe] mDNS probe send failed", err);
				} else {
					console.log(
						"[local-network-probe] mDNS probe sent — macOS should now register Vetta for Local Network access",
					);
				}
				setTimeout(() => {
					try {
						socket.close();
					} catch {
						// already closed
					}
				}, 200);
			});
		});
	} catch (err) {
		console.warn("[local-network-probe] failed to send mDNS probe", err);
	}
}

// 包裹 globalThis.fetch：fetch 失败时把请求 URL 和完整 cause 链记下来。诊断
// "Connection error." 必备：anthropic-ai-sdk / openai-node 在网络层失败时只会
// 抛 "Connection error." 占位文案，真正的 ECONNREFUSED / EHOSTUNREACH / DNS
// 错误都藏在底层 fetch 的 cause 里，不在这里捕获就拿不到。
function patchFetch(): void {
	const orig = globalThis.fetch;
	if (typeof orig !== "function") return;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		try {
			return await orig(input, init);
		} catch (err) {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
			console.error("[fetch] failed", { url }, err);
			throw err;
		}
	}) as typeof fetch;
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

	patchFetch();
	triggerLocalNetworkPermission();

	// 启动时打印关键 env —— 排查 "终端启动 OK / Finder 启动异常" 这类
	// launchd vs shell 环境差异问题（PATH / proxy / VETTA_SERVER_URL 等）的
	// 第一手依据。
	console.log("[startup]", {
		version: app.getVersion(),
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
	});
}
