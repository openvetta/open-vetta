import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialMcpApi } from "./plugin-official-mcp.js";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("createOfficialMcpApi", () => {
	it("routes MCP operations through the capability session", async () => {
		const summary = { name: "web", type: "http" as const, disabled: false, url: "https://mcp.example.com" };
		const detail = { ...summary, headers: { Authorization: "***" } };
		const mcp = {
			list: vi.fn().mockResolvedValue([summary]),
			get: vi.fn().mockResolvedValue(detail),
			upsert: vi.fn().mockResolvedValue(detail),
			setEnabled: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { plugins: { internalCapabilities: { mcp } } } },
		});
		const assertOfficial = vi.fn();
		const api = createOfficialMcpApi(assertOfficial, "capability-session");

		await expect(api.list()).resolves.toEqual([summary]);
		await expect(api.get("web")).resolves.toEqual(detail);
		await expect(api.listNames()).resolves.toEqual(["web"]);
		await expect(api.upsert("web", { type: "http", url: "https://mcp.example.com" })).resolves.toEqual(detail);
		await expect(api.setEnabled("web", true)).resolves.toBeUndefined();
		await expect(api.remove("web")).resolves.toBeUndefined();

		expect(assertOfficial).toHaveBeenCalledTimes(6);
		expect(mcp.list).toHaveBeenCalledWith("capability-session", undefined);
		expect(mcp.get).toHaveBeenCalledWith("capability-session", "web", undefined);
		expect(mcp.upsert).toHaveBeenCalledWith(
			"capability-session",
			"web",
			{
				type: "http",
				url: "https://mcp.example.com",
			},
			undefined,
		);
		expect(mcp.setEnabled).toHaveBeenCalledWith("capability-session", "web", true, undefined);
		expect(mcp.remove).toHaveBeenCalledWith("capability-session", "web", undefined);
	});

	it("forwards the config target so project-level calls reach the host", async () => {
		const mcp = {
			list: vi.fn().mockResolvedValue([{ name: "docs" }]),
			get: vi.fn().mockResolvedValue({ name: "docs" }),
			upsert: vi.fn().mockResolvedValue({ name: "docs" }),
			setEnabled: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { plugins: { internalCapabilities: { mcp } } } },
		});
		const api = createOfficialMcpApi(vi.fn(), "capability-session");
		const target = { scope: "project", cwd: "/work/repo" } as const;

		await api.list(target);
		await expect(api.listNames(target)).resolves.toEqual(["docs"]);
		await api.get("docs", target);
		await api.upsert("docs", { command: "node" }, target);
		await api.setEnabled("docs", false, target);
		await api.remove("docs", target);

		expect(mcp.list).toHaveBeenCalledWith("capability-session", target);
		expect(mcp.get).toHaveBeenCalledWith("capability-session", "docs", target);
		expect(mcp.upsert).toHaveBeenCalledWith("capability-session", "docs", { command: "node" }, target);
		expect(mcp.setEnabled).toHaveBeenCalledWith("capability-session", "docs", false, target);
		expect(mcp.remove).toHaveBeenCalledWith("capability-session", "docs", target);
	});
});
