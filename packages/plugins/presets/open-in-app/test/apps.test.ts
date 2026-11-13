import { describe, expect, it } from "vitest";
import { buildOpenArgs, buildProbeArgs, EXTERNAL_APPS, isMacPlatform, isOpenableCwd } from "../src/apps";

const byId = (id: string) => {
	const app = EXTERNAL_APPS.find((candidate) => candidate.id === id);
	if (!app) throw new Error(`missing app ${id}`);
	return app;
};

describe("open-in-app commands", () => {
	it("Finder opens the folder itself, everything else goes through open -a", () => {
		expect(buildOpenArgs(byId("finder"), "/work/demo")).toEqual(["/work/demo"]);
		expect(buildOpenArgs(byId("vscode"), "/work/demo")).toEqual(["-a", "Visual Studio Code", "/work/demo"]);
		expect(buildOpenArgs(byId("zed"), "/work/my project")).toEqual(["-a", "Zed", "/work/my project"]);
	});

	it("probes with open -Ra so detection never launches the app", () => {
		expect(buildProbeArgs(byId("cursor"))).toEqual(["-Ra", "Cursor"]);
	});

	it("keeps ids unique and Finder always available", () => {
		const ids = EXTERNAL_APPS.map((app) => app.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(byId("finder").alwaysAvailable).toBe(true);
	});
});

describe("open-in-app applicability", () => {
	it("only local, non-empty directories are openable", () => {
		expect(isOpenableCwd("/Users/me/project")).toBe(true);
		expect(isOpenableCwd("ssh://host/home/me/project")).toBe(false);
		expect(isOpenableCwd("")).toBe(false);
		expect(isOpenableCwd(null)).toBe(false);
	});

	it("recognises macOS platforms", () => {
		expect(isMacPlatform("MacIntel")).toBe(true);
		expect(isMacPlatform("Win32")).toBe(false);
		expect(isMacPlatform("Linux x86_64")).toBe(false);
	});
});
