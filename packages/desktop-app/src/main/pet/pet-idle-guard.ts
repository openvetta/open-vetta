import { powerMonitor } from "electron";
import { getAppLogger } from "../logger.js";
import { getPetWindow, sendPetCommandToWindow } from "../pet-window.js";

const log = getAppLogger("pet-idle-guard");

/**
 * 系统无人值守（空闲/锁屏/休眠）时暂停桌宠视频解码，唤醒后恢复。
 *
 * 背景：桌宠是透明置顶窗口，24/7 连续解码+合成 loop 视频。在 macOS（尤其 Retina）
 * 上持续解码会让 renderer/合成层 native 内存随时长累积（通宵可达数 GB），并常驻高 CPU；
 * Windows 因解码/合成路径不同不受影响。既然过夜场景机器本就空闲，空闲即暂停即可从根上
 * 消除累积与 CPU 占用，且不依赖具体平台的泄漏根因。
 */
const IDLE_PAUSE_SECONDS = 180;
const POLL_INTERVAL_MS = 30_000;

let pollTimer: ReturnType<typeof setInterval> | undefined;
let paused = false;

function setPlayback(playing: boolean): void {
	if (paused === !playing) return;
	// 无桌宠窗口时不必发（关闭/未启用），恢复播放时也无副作用。
	if (!getPetWindow()) return;
	paused = !playing;
	sendPetCommandToWindow({ type: "set-playback", playing });
	log.info(playing ? "resume" : "pause");
}

function checkIdle(): void {
	if (!getPetWindow()) return;
	const idleSeconds = powerMonitor.getSystemIdleTime();
	setPlayback(idleSeconds < IDLE_PAUSE_SECONDS);
}

/** 应用启动时调用一次：挂系统电源/空闲事件，据此暂停/恢复桌宠视频。 */
export function startPetIdleGuard(): void {
	if (pollTimer) return;
	pollTimer = setInterval(checkIdle, POLL_INTERVAL_MS);
	// 锁屏/休眠：立即暂停（不等轮询）。解锁/唤醒：立即恢复。
	powerMonitor.on("lock-screen", () => setPlayback(false));
	powerMonitor.on("suspend", () => setPlayback(false));
	powerMonitor.on("unlock-screen", () => setPlayback(true));
	powerMonitor.on("resume", () => setPlayback(true));
}
