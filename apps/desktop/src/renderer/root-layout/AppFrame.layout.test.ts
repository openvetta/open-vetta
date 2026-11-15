import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { it } from "vitest";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../../../scripts/app-frame-layout.node-test.mjs", import.meta.url));

it("真实 Electron 外框在聊天与新会话之间切换时保持侧边栏贴底", async () => {
	const args = [process.execPath, "--test", script];
	// CI Linux needs a display for Electron, even though its test window stays hidden.
	if (process.platform === "linux" && !process.env.DISPLAY) {
		await run("xvfb-run", ["-a", ...args], { timeout: 120_000 });
	} else {
		await run(args[0], args.slice(1), { timeout: 120_000 });
	}
}, 130_000);
