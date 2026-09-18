import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOfficialSessionsApi } from "./plugin-official-sessions";
import { pluginRendererCapabilityHost } from "./plugin-renderer-capability-host";

// atoms 桶文件在模块求值期就要 window/localStorage（整个 renderer store 图）；
// 这里只用到 open 的那个 ref，直接替掉，避免为一个纯函数模块拉起半个 renderer。
vi.mock("@shared/store/atoms", () => ({ openSessionFnRef: { current: null } }));

const SESSION = "official-session";

function stubHostSessionApi(): {
	create: ReturnType<typeof vi.fn>;
	prompt: ReturnType<typeof vi.fn>;
	rename: ReturnType<typeof vi.fn>;
	updateSettings: ReturnType<typeof vi.fn>;
} {
	const api = {
		create: vi.fn(async () => ({ sessionId: "runtime-1", sessionPath: "/s.jsonl" })),
		prompt: vi.fn(async () => ({ status: "sent" as const })),
		rename: vi.fn(async () => undefined),
		updateSettings: vi.fn(async () => undefined),
	};
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { vetta: { session: api } },
	});
	return api;
}

describe("official.sessions 的模型指定", () => {
	beforeEach(() => {
		pluginRendererCapabilityHost.bindSession(SESSION, {
			id: "kanban",
			enabled: true,
			trustLevel: "official",
		});
	});

	it("create 传 modelKey 时写入会话设置（而非只作用于单轮）", async () => {
		const host = stubHostSessionApi();
		await createOfficialSessionsApi(SESSION).create({ cwd: "/work", modelKey: "anthropic/claude-opus-5" });
		expect(host.updateSettings).toHaveBeenCalledWith("runtime-1", { modelKey: "anthropic/claude-opus-5" });
	});

	it("create 不传模型 / 传空白时不碰会话设置，交给宿主全局默认", async () => {
		const host = stubHostSessionApi();
		const api = createOfficialSessionsApi(SESSION);
		await api.create({ cwd: "/work" });
		await api.create({ cwd: "/work", modelKey: "   " });
		expect(host.updateSettings).not.toHaveBeenCalled();
	});

	it("prompt 的 modelKey 只钉住这一轮，随请求下发", async () => {
		const host = stubHostSessionApi();
		const api = createOfficialSessionsApi(SESSION);
		await api.prompt("runtime-1", "hi", { modelKey: "openai/gpt-5" });
		expect(host.prompt).toHaveBeenCalledWith("runtime-1", { text: "hi", modelKey: "openai/gpt-5" });

		await api.prompt("runtime-1", "hi");
		expect(host.prompt).toHaveBeenLastCalledWith("runtime-1", { text: "hi" });
		expect(host.updateSettings).not.toHaveBeenCalled();
	});
});

describe("official.sessions.list 的可用性透传", () => {
	beforeEach(() => {
		pluginRendererCapabilityHost.bindSession(SESSION, {
			id: "kanban",
			enabled: true,
			trustLevel: "official",
		});
	});

	function stubListSessions(sessions: unknown[]): void {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { session: { listSessions: vi.fn(async () => sessions) } } },
		});
	}

	it("把宿主的 access 逐位透出，调用方据此决定跳不跳", async () => {
		stubListSessions([
			{
				path: "/s.jsonl",
				cwd: "/work",
				firstMessage: "hi",
				modifiedAt: 5,
				access: { readHistory: true, resume: true, rename: true, delete: false },
			},
		]);
		const [session] = await createOfficialSessionsApi(SESSION).list("/work");
		expect(session.access).toEqual({ readHistory: true, interactiveResume: true, rename: true, delete: false });
	});

	it("缺字段读作「完全不可用」，宁可退回新建会话页也不打开一个打不开的会话", async () => {
		stubListSessions([{ path: "/s.jsonl", modifiedAt: 5 }]);
		const [session] = await createOfficialSessionsApi(SESSION).list("/work");
		expect(session.access).toEqual({ readHistory: false, interactiveResume: false, rename: false, delete: false });
	});
});

describe("official.sessions.list 的来源过滤", () => {
	beforeEach(() => {
		pluginRendererCapabilityHost.bindSession(SESSION, {
			id: "kanban",
			enabled: true,
			trustLevel: "official",
		});
	});

	function stubListSessions(sessions: unknown[]): void {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { session: { listSessions: vi.fn(async () => sessions) } } },
		});
	}

	const native = {
		path: "/vetta.jsonl",
		cwd: "/work",
		firstMessage: "native",
		modifiedAt: 10,
		access: { readHistory: true, resume: true, rename: true, delete: true },
	};
	const external = {
		path: "/grok/summary.json",
		cwd: "/work",
		firstMessage: "grok chat",
		modifiedAt: 20,
		access: { readHistory: true, resume: false, rename: false, delete: false },
		origin: { tool: "grok", path: "/grok/summary.json" },
	};

	it("默认不返回外部工具会话，存量派单不会踩进陌生会话", async () => {
		stubListSessions([native, external]);
		const sessions = await createOfficialSessionsApi(SESSION).list("/work");
		expect(sessions.map((session) => session.path)).toEqual(["/vetta.jsonl"]);
		expect(sessions[0]?.origin).toBeUndefined();
	});

	it("显式声明外部来源时返回外部会话，并带上工具标识与原始路径", async () => {
		stubListSessions([native, external]);
		const sessions = await createOfficialSessionsApi(SESSION).list("/work", { origin: "external" });
		expect(sessions).toEqual([
			{
				path: "/grok/summary.json",
				cwd: "/work",
				firstMessage: "grok chat",
				modifiedAt: 20,
				access: { readHistory: true, interactiveResume: false, rename: false, delete: false },
				origin: { tool: "grok", path: "/grok/summary.json" },
			},
		]);
	});

	it("来源信息缺失或不完整一律读作 Vetta 原生，进入默认列表且不携带 origin", async () => {
		stubListSessions([
			{ path: "/missing.jsonl", modifiedAt: 1 },
			{ path: "/empty.jsonl", modifiedAt: 2, origin: {} },
			{ path: "/tool-only.jsonl", modifiedAt: 3, origin: { tool: "grok" } },
			{ path: "/path-only.jsonl", modifiedAt: 4, origin: { path: "/grok/summary.json" } },
			{ path: "/blank.jsonl", modifiedAt: 5, origin: { tool: "  ", path: "  " } },
			external,
		]);
		const sessions = await createOfficialSessionsApi(SESSION).list("/work");
		expect(sessions.map((session) => session.path)).toEqual([
			"/missing.jsonl",
			"/empty.jsonl",
			"/tool-only.jsonl",
			"/path-only.jsonl",
			"/blank.jsonl",
		]);
		expect(sessions.every((session) => session.origin === undefined)).toBe(true);
	});

	it("同时声明原生与外部来源时两类都返回，且仅外部条目携带 origin", async () => {
		stubListSessions([native, external]);
		const sessions = await createOfficialSessionsApi(SESSION).list("/work", { origin: ["vetta", "external"] });
		expect(sessions.map((session) => session.path)).toEqual(["/vetta.jsonl", "/grok/summary.json"]);
		expect(sessions[0]?.origin).toBeUndefined();
		expect(sessions[1]?.origin).toEqual({ tool: "grok", path: "/grok/summary.json" });
	});

	it("无法识别的来源参数按缺省处理，只返回 Vetta 原生", async () => {
		stubListSessions([native, external]);
		const sessions = await createOfficialSessionsApi(SESSION).list("/work", {
			origin: "all" as "vetta",
		});
		expect(sessions.map((session) => session.path)).toEqual(["/vetta.jsonl"]);
	});
});
