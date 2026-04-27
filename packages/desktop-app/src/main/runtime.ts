import { RuntimeHost } from "../../../runtime-core/src/index.js";
import { readDesktopConfig } from "./ipc/fs.js";
import { getAvailableLinuxBubblewrapPath } from "./sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "./sandbox/windows-binary-resolver.js";

// 进程级共享 RuntimeHost：session IPC、定时任务 (scheduler) 与批量任务
// (batch-tasks) 必须复用同一实例，否则任一模块 createSession 后没 dispose
// 时，其它模块再次 open 同一 sessionPath 会在同进程里撞 SessionLockError，
// 导致点击跳转走向 Welcome 页（见定时任务历史跳转 bug）。
let sharedRuntime: RuntimeHost | null = null;

export function getSharedRuntime(): RuntimeHost {
	if (!sharedRuntime) {
		sharedRuntime = new RuntimeHost({
			getDefaultExecutionMode: async () => {
				const config = await readDesktopConfig();
				return config.defaultExecutionMode;
			},
			sandboxHostPath: resolveWindowsSandboxHostBinary()?.path,
			linuxBubblewrapPath: getAvailableLinuxBubblewrapPath(),
		});
	}
	return sharedRuntime;
}

export async function disposeSharedRuntime(): Promise<void> {
	if (!sharedRuntime) return;
	const runtime = sharedRuntime;
	sharedRuntime = null;
	await runtime.disposeAllSessions();
}
