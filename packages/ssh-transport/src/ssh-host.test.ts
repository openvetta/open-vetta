import { describe, expect, it } from "vitest";
import { buildSshArgv } from "./ssh-argv.js";
import { normalizeSshHostInput } from "./ssh-host.js";

describe("密码登录", () => {
	it("记录认证方式并丢弃私钥路径", () => {
		const host = normalizeSshHostInput({ label: "a", target: "u@h", authMethod: "password", identityFile: "~/k" });
		expect(host.authMethod).toBe("password");
		expect(host.identityFile).toBeUndefined();
	});

	it("私钥登录不写入 authMethod", () => {
		expect(normalizeSshHostInput({ label: "a", target: "h", authMethod: "key" }).authMethod).toBeUndefined();
	});

	it("argv 只尝试口令类认证，不先试本机私钥", () => {
		const argv = buildSshArgv(
			{ id: "1", label: "a", target: "h", source: "manual", authMethod: "password" },
			{ controlPath: "/tmp/c" },
		);
		expect(argv).toContain("PubkeyAuthentication=no");
		expect(argv).toContain("PreferredAuthentications=password,keyboard-interactive");
	});
});
