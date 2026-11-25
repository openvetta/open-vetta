import { describe, expect, it } from "vitest";
import { buildPortForwardProcessArgv, buildSshArgv } from "./ssh-argv.js";
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

describe("不复用连接（Windows 自带的 OpenSSH 不支持 ControlMaster）", () => {
	const host = { id: "1", label: "a", target: "u@h", source: "manual" as const, port: 2222 };

	it("不给 controlPath 时一个复用选项都不带，其余建连选项照旧", () => {
		const argv = buildSshArgv(host, {}, "uname");
		expect(argv.some((arg) => arg.startsWith("Control"))).toBe(false);
		expect(argv).toEqual(["-o", "ConnectTimeout=15", "-p", "2222", "-T", "--", "u@h", "uname"]);
	});

	it("端口转发由一个只转发的 ssh -N 承载，转发不成就退出", () => {
		const argv = buildPortForwardProcessArgv(host, {}, { localPort: 5173, remotePort: 3000 });
		expect(argv.some((arg) => arg.startsWith("Control"))).toBe(false);
		expect(argv).toEqual(expect.arrayContaining(["-N", "ExitOnForwardFailure=yes", "-L", "5173:127.0.0.1:3000"]));
		expect(argv.slice(-2)).toEqual(["--", "u@h"]);
	});
});
