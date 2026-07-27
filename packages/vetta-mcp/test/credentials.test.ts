import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialsPath, loadCredentials, normalizeBaseUrl } from "../src/credentials.js";

describe("normalizeBaseUrl", () => {
	it("去掉结尾斜杠，避免拼出 //api/v1", () => {
		expect(normalizeBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
		expect(normalizeBaseUrl("https://api.example.com///")).toBe("https://api.example.com");
		expect(normalizeBaseUrl("https://api.example.com")).toBe("https://api.example.com");
	});
});

describe("loadCredentials", () => {
	let home: string;
	const saved = { ...process.env };

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "vetta-cred-"));
		process.env.VETTA_HOME = home;
		delete process.env.VETTA_API_TOKEN;
		delete process.env.VETTA_API_BASE_URL;
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		process.env = { ...saved };
	});

	function writeAuth(content: string) {
		writeFileSync(credentialsPath(), content);
	}

	it("读取主进程写下的凭据文件", () => {
		writeAuth(JSON.stringify({ baseUrl: "https://api.example.com/", token: "tok" }));
		expect(loadCredentials()).toEqual({ baseUrl: "https://api.example.com", token: "tok" });
	});

	it("环境变量优先于文件", () => {
		writeAuth(JSON.stringify({ baseUrl: "https://file.example.com", token: "file-token" }));
		process.env.VETTA_API_BASE_URL = "https://env.example.com";
		process.env.VETTA_API_TOKEN = "env-token";

		expect(loadCredentials()).toEqual({ baseUrl: "https://env.example.com", token: "env-token" });
	});

	it("文件不存在时返回 null 而不是抛错", () => {
		expect(loadCredentials()).toBeNull();
	});

	it("文件非法 JSON 时返回 null", () => {
		writeAuth("not json");
		expect(loadCredentials()).toBeNull();
	});

	it("缺 token 或 baseUrl 视同未登录", () => {
		writeAuth(JSON.stringify({ baseUrl: "https://api.example.com" }));
		expect(loadCredentials()).toBeNull();

		writeAuth(JSON.stringify({ token: "tok" }));
		expect(loadCredentials()).toBeNull();
	});

	it("忽略主进程多写的字段，不与其强耦合", () => {
		writeAuth(JSON.stringify({ baseUrl: "https://api.example.com", token: "tok", username: "x", extra: 1 }));
		expect(loadCredentials()).toEqual({ baseUrl: "https://api.example.com", token: "tok" });
	});

	it("凭据路径落在 VETTA_HOME 下", () => {
		expect(credentialsPath()).toBe(join(home, "auth.json"));
	});
});
