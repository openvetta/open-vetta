import { type AddressInfo, createServer, type Server } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { SshOperationAbortedError, SshRemoteCommandError, SshTransportError } from "./errors.js";
import type {
	SshChannelInvocation,
	SshProcessInvocation,
	SshProcessResult,
	SshProcessRunner,
} from "./process-runner.js";
import { buildKillCommand, buildRemoteCommand, buildWriteFileCommand } from "./remote-command.js";
import { SshConnection } from "./ssh-connection.js";
import type { SshHost } from "./ssh-host.js";
import { unwrapLoginShellCommand } from "./testing.js";

const host: SshHost = { id: "build-01", label: "构建机", target: "build", source: "manual" };

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function ok(stdout: string): SshProcessResult {
	return { exitCode: 0, stdout: encode(stdout), stderr: "", aborted: false };
}

/** 这次调用真正要远端 `/bin/sh` 执行的命令行。 */
function commandOf(invocation: SshProcessInvocation): string {
	return unwrapLoginShellCommand(String(invocation.argv.at(-1)));
}

/** 按远端命令内容依次应答，并记录每次调用，便于断言真正发出去的是什么。 */
function createRunner(reply: (remoteCommand: string) => SshProcessResult): {
	runner: SshProcessRunner;
	calls: SshProcessInvocation[];
} {
	const calls: SshProcessInvocation[] = [];
	const runner: SshProcessRunner = {
		run: async (invocation) => {
			calls.push(invocation);
			return reply(commandOf(invocation));
		},
	};
	return { runner, calls };
}

function connect(reply: (remoteCommand: string) => SshProcessResult) {
	const { runner, calls } = createRunner(reply);
	return { connection: new SshConnection(host, { runner, controlPath: "/tmp/cp" }), calls };
}

describe("远端平台探测", () => {
	it("Linux 用 GNU stat，macOS 用 BSD stat", async () => {
		const linux = connect(() => ok("Linux\nx86_64\n"));
		await expect(linux.connection.probePlatform()).resolves.toMatchObject({
			os: "Linux",
			arch: "x86_64",
			statFlavor: "gnu",
		});

		const mac = connect(() => ok("Darwin\narm64\n"));
		await expect(mac.connection.probePlatform()).resolves.toMatchObject({ statFlavor: "bsd" });
	});

	it("结果缓存，不会每次操作都多一次往返", async () => {
		const { connection, calls } = connect(() => ok("Linux\nx86_64\n"));
		await connection.probePlatform();
		await connection.probePlatform();
		expect(calls).toHaveLength(1);
	});
});

describe("远端文件读写", () => {
	it("读文件走原始字节，不经登录 shell——profile 的输出会混进文件内容", async () => {
		const { connection, calls } = connect(() => ok("file body"));
		await expect(connection.readFile("/srv/a.txt")).resolves.toEqual(encode("file body"));
		const remoteCommand = commandOf(calls[0]);
		expect(remoteCommand).toBe("cat -- '/srv/a.txt'");
		expect(remoteCommand).not.toContain("SHELL");
	});

	it("写文件先写同目录临时文件再 mv，内容走 stdin 而不是命令行", async () => {
		const { connection, calls } = connect(() => ok(""));
		await connection.writeFile("/srv/a.txt", encode("hello"));
		const remoteCommand = commandOf(calls[0]);
		expect(remoteCommand).toBe(
			buildWriteFileCommand("/srv/a.txt", remoteCommand.match(/\.vetta-tmp-[a-z0-9]+/)?.[0] ?? ""),
		);
		expect(calls[0].stdin).toEqual(encode("hello"));
	});

	it("读一个不存在的文件，报的是远端命令失败而不是传输故障", async () => {
		const { connection } = connect(() => ({
			exitCode: 1,
			stdout: new Uint8Array(),
			stderr: "cat: /srv/x: No such file or directory",
			aborted: false,
		}));
		await expect(connection.readFile("/srv/x")).rejects.toBeInstanceOf(SshRemoteCommandError);
	});
});

describe("目录列举", () => {
	it("解析出类型、大小与修改时间，并去掉 find 的 ./ 前缀", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: ok("directory\t4096\t1700000000\t./src\nregular file\t12\t1700000001\t./a b.txt\n"),
		);
		await expect(connection.listDirectory("/srv")).resolves.toEqual([
			{ name: "src", kind: "directory", sizeBytes: 4096, modifiedAtSeconds: 1700000000 },
			{ name: "a b.txt", kind: "file", sizeBytes: 12, modifiedAtSeconds: 1700000001 },
		]);
	});

	it("路径不存在时 stat 返回 null——这是远端给出的答复", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname") ? ok("Linux\nx86_64\n") : ok(""),
		);
		await expect(connection.stat("/srv/missing")).resolves.toBeNull();
	});
});

describe("失败分类（ADR-0124 执行边界）", () => {
	it("ssh 退出 255 判为传输故障，判定是 unverifiable 而不是 exited", async () => {
		const { connection } = connect(() => ({
			exitCode: 255,
			stdout: new Uint8Array(),
			stderr: "ssh: connect to host build port 22: Connection refused",
			aborted: false,
		}));
		const error = await connection.readFile("/srv/a").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshTransportError);
		expect((error as SshTransportError).verdict).toBe("unverifiable");
	});

	it("Windows 上 ssh 以 -1 退出（Node 报成 4294967295）同样是传输故障", async () => {
		// 远端命令的退出码只能落在 0–255，这个值只可能是本机 ssh 自己给的。
		const { connection } = connect(() => ({
			exitCode: 4294967295,
			stdout: new Uint8Array(),
			stderr: "Read from remote host 192.0.2.10: Unknown error",
			aborted: false,
		}));
		const error = await connection.probePlatform().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshTransportError);
		expect((error as Error).message).toMatch(/^Cannot reach 构建机: Read from remote host/);
	});

	it("取消同样是 unverifiable：远端可能已经执行完了", async () => {
		const { connection } = connect(() => ({
			exitCode: null,
			stdout: new Uint8Array(),
			stderr: "",
			aborted: true,
		}));
		const error = await connection.exec("make").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshOperationAbortedError);
		expect((error as SshOperationAbortedError).verdict).toBe("unverifiable");
	});

	it("超时与取消分得开，调用方才能告诉模型「跑太久了」而不是「被取消了」", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true, timedOut: true },
		);
		const error = await connection.exec("make").catch((e: unknown) => e);
		expect((error as SshOperationAbortedError).reason).toBe("timeout");
	});

	it("取消的那一刻就去远端杀进程组，不等本地 ssh 自己退出", async () => {
		// 没有 pty，关通道不会让远端进程结束；而远端进程攥着 stdout 时，本地 ssh 也未必退得出来。
		const calls: SshProcessInvocation[] = [];
		const controller = new AbortController();
		const runner: SshProcessRunner = {
			run: (invocation) => {
				calls.push(invocation);
				const remoteCommand = commandOf(invocation);
				if (remoteCommand.includes("uname")) return Promise.resolve(ok("Linux\nx86_64\n"));
				if (!remoteCommand.includes("npm run dev")) return Promise.resolve(ok(""));
				// 用户命令一直不结束，直到被掐断。
				return new Promise((resolve) => {
					invocation.signal?.addEventListener("abort", () =>
						resolve({ exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true }),
					);
				});
			},
		};
		const connection = new SshConnection(host, { runner, controlPath: "/tmp/cp" });

		const pending = connection.exec("npm run dev", { signal: controller.signal }).catch((e: unknown) => e);
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		controller.abort();

		const error = await pending;
		expect(error).toBeInstanceOf(SshOperationAbortedError);
		expect((error as SshOperationAbortedError).reason).toBe("aborted");
		const commands = calls.map((call) => commandOf(call));
		const token = commands[1].match(/vetta-exec-[0-9a-f]+/)?.[0] ?? "";
		expect(commands[2]).toBe(buildKillCommand(token));
	});

	it("超时由连接自己计时，到点同样先杀远端再报超时", async () => {
		const calls: string[] = [];
		const runner: SshProcessRunner = {
			run: (invocation) => {
				const remoteCommand = commandOf(invocation);
				calls.push(remoteCommand);
				if (remoteCommand.includes("uname")) return Promise.resolve(ok("Linux\nx86_64\n"));
				if (!remoteCommand.includes("sleep 999")) return Promise.resolve(ok(""));
				return new Promise((resolve) => {
					invocation.signal?.addEventListener("abort", () =>
						resolve({ exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true }),
					);
				});
			},
		};
		const connection = new SshConnection(host, { runner, controlPath: "/tmp/cp" });

		const error = await connection.exec("sleep 999", { timeoutMs: 30 }).catch((e: unknown) => e);

		expect((error as SshOperationAbortedError).reason).toBe("timeout");
		expect(calls.some((command) => command.includes("kill -TERM"))).toBe(true);
	});

	it("本地 ssh 被外部杀掉时不报成功：远端命令的结局不可知", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: false },
		);
		await expect(connection.exec("make")).rejects.toBeInstanceOf(SshTransportError);
	});

	it("命令返回非零是 exited——远端确实回答了", async () => {
		const { connection } = connect(() => ({
			exitCode: 2,
			stdout: new Uint8Array(),
			stderr: "boom",
			aborted: false,
		}));
		const error = await connection.makeDirectory("/srv/x").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshRemoteCommandError);
		expect((error as SshRemoteCommandError).verdict).toBe("exited");
		expect((error as SshRemoteCommandError).exitCode).toBe(2);
	});
});

describe("用户命令执行", () => {
	it("先建立连接再跑命令：认证不能受调用方那条短超时的约束", async () => {
		// 口令、2FA 和指纹确认只发生在第一条命令上。若它跟着「这条命令该跑多久」的
		// 超时走，用户还在输密码时 ssh 就被杀了，表现为输完密码却提示连接失败。
		const { connection, calls } = connect((remoteCommand) =>
			remoteCommand.includes("uname") ? ok("Linux\nx86_64\n") : ok(""),
		);

		await connection.exec("npm test", { timeoutMs: 1_000 });

		expect(commandOf(calls[0])).toContain("uname");
		expect(calls[0].timeoutMs).toBeGreaterThan(60_000);
	});

	it("带工作目录与流式输出，退出码原样返回而不抛", async () => {
		const onStdout = vi.fn();
		const { connection, calls } = connect((remoteCommand) =>
			// 第一条命令是建立连接的平台探测；用户命令才是被测的那一条。
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: 1, stdout: encode("test failed"), stderr: "", aborted: false },
		);
		await expect(connection.exec("npm test", { cwd: "/srv/app", onStdout })).resolves.toMatchObject({
			exitCode: 1,
		});
		// 引用语义由 remote-command 的测试守住，这里只证明 cwd 确实被透传下去。
		const userCommand = calls.map((call) => commandOf(call)).at(-1);
		const processToken = userCommand?.match(/vetta-exec-[0-9a-f]+/)?.[0];
		expect(userCommand).toBe(buildRemoteCommand("npm test", { cwd: "/srv/app", processToken }));
	});
});

describe("远端端口与进程", () => {
	it("ssh exec 路径下多问一次 ps 补上启动时间，22 照样列出但标成敏感", async () => {
		const { connection, calls } = connect((command) => {
			if (command.startsWith("uname")) return ok("Linux\nx86_64\n");
			if (command.includes("@vetta-listeners")) {
				return ok(
					[
						"@vetta-listeners ss",
						'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=23))',
						'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=800,fd=3))',
					].join("\n"),
				);
			}
			if (command.includes("ps -o pid=")) return ok("1234 00:10 node server.js\n");
			return ok("");
		});

		const scan = await connection.listListeningPorts();

		// 一次 ps 问完所有 pid，不按端口逐个往返。
		expect(calls.filter((call) => commandOf(call).includes("ps -o pid="))).toHaveLength(1);
		const app = scan.ports.find((port) => port.port === 3000);
		expect(app).toMatchObject({ command: "node server.js", sensitive: false });
		expect(app?.startedAt).toBeLessThanOrEqual(Date.now() - 10_000);
		expect(scan.ports.find((port) => port.port === 22)).toMatchObject({ sensitive: true, processName: "sshd" });
	});

	it("ps 失败只是少了时间，扫描本身照常返回", async () => {
		const { connection } = connect((command) => {
			if (command.startsWith("uname")) return ok("Linux\nx86_64\n");
			if (command.includes("@vetta-listeners")) {
				return ok('@vetta-listeners ss\nLISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=23))\n');
			}
			return { exitCode: 127, stdout: encode(""), stderr: "ps: not found", aborted: false };
		});

		const scan = await connection.listListeningPorts();

		expect(scan.ports).toHaveLength(1);
		expect(scan.ports[0]).toMatchObject({ port: 3000, processName: "node", sensitive: false });
		expect(scan.ports[0]?.startedAt).toBeUndefined();
	});

	it("终止进程：退出、还活着、没权限三种结局分得开", async () => {
		const exited = connect(() => ok(""));
		await expect(exited.connection.terminateProcess(1234)).resolves.toEqual({ exited: true });
		expect(commandOf(exited.calls[0])).toContain("kill -s TERM 1234");

		const alive = connect(() => ({ exitCode: 3, stdout: encode(""), stderr: "", aborted: false }));
		await expect(alive.connection.terminateProcess(1234, { force: true })).resolves.toEqual({ exited: false });
		expect(commandOf(alive.calls[0])).toContain("kill -s KILL 1234");

		const denied = connect(() => ({
			exitCode: 1,
			stdout: encode(""),
			stderr: "kill: (800) - Operation not permitted",
			aborted: false,
		}));
		await expect(denied.connection.terminateProcess(800)).rejects.toThrow(/Operation not permitted/);
	});
});

describe("不复用连接时的端口转发", () => {
	/** 一个能开通道的执行器：`ssh -N` 被替换成 `behave` 描述的行为。 */
	function connectWithChannels(
		behave: (localPort: number) => { exited: Promise<{ exitCode: number | null; stderr: string }>; kill: () => void },
	) {
		const opened: SshChannelInvocation[] = [];
		const runner: SshProcessRunner = {
			run: async () => ok("Linux\nx86_64\n"),
			open: (invocation) => {
				opened.push(invocation);
				const spec = invocation.argv[invocation.argv.indexOf("-L") + 1] ?? "";
				const channel = behave(Number(spec.split(":")[0]));
				return { write: () => {}, end: () => {}, kill: channel.kill, exited: channel.exited };
			},
		};
		return { connection: new SshConnection(host, { runner }), opened };
	}

	async function freePort(): Promise<number> {
		const server = createServer();
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const port = (server.address() as AddressInfo).port;
		await new Promise((resolve) => server.close(resolve));
		return port;
	}

	it("本机端口能连上即算建成；撤销时结束那个 ssh 进程", async () => {
		const localPort = await freePort();
		let server: Server | undefined;
		let finish: (exit: { exitCode: number | null; stderr: string }) => void = () => {};
		const { connection, opened } = connectWithChannels((port) => {
			// 模拟 ssh 认证花了一点时间才开始监听。
			setTimeout(() => {
				server = createServer((socket) => socket.destroy()).listen(port, "127.0.0.1");
			}, 150);
			return {
				exited: new Promise((resolve) => {
					finish = resolve;
				}),
				kill: () => {
					server?.close();
					finish({ exitCode: null, stderr: "" });
				},
			};
		});

		await connection.forwardPort(localPort, 3000);
		expect(opened).toHaveLength(1);
		// 同一条转发再要一次不会多起一个进程。
		await connection.forwardPort(localPort, 3000);
		expect(opened).toHaveLength(1);

		await connection.cancelPortForward(localPort, 3000);
		await connection.forwardPort(localPort, 3000);
		expect(opened).toHaveLength(2);
		await connection.cancelPortForward(localPort, 3000);
	});

	it("ssh 在转发建成前退出时，把它给的原因报出来", async () => {
		const localPort = await freePort();
		const { connection } = connectWithChannels(() => ({
			exited: Promise.resolve({
				exitCode: 255,
				stderr: "channel_setup_fwd_listener_tcpip: cannot listen to port\n",
			}),
			kill: () => {},
		}));

		const error = await connection.forwardPort(localPort, 3000).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshTransportError);
		expect((error as Error).message).toMatch(/cannot listen to port/);
	});
});
