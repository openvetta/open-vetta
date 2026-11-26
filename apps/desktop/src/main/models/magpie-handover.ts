import { getAppLogger } from "../logger.js";
import { type LegacyMagpieRemoval, removeLegacyMagpiePreset } from "./magpie-legacy-preset.js";
import { getDesktopModelSettingsService } from "./model-settings-host.js";

const log = getAppLogger("magpie-migration");

let pending: Promise<LegacyMagpieRemoval | null> | null = null;

/**
 * 升级后启动时删掉旧版在 Vetta 里启用的 Magpie。删过一次条目就不在了,之后的启动什么也不做。
 * 提示由界面加载好后来领取(见 takeMagpieHandoverNotice),这样能用应用自己的对话框而不是系统弹窗。
 */
export function startLegacyMagpieMigration(): void {
	pending ??= removeLegacyMagpiePreset(getDesktopModelSettingsService())
		.then((removed) => {
			if (removed) log.info("已移除旧版在 Vetta 里启用的 Magpie 配置,改由 Magpie 接入");
			return removed;
		})
		.catch((error: unknown) => {
			log.warn("移除旧版 Magpie 配置失败:", error);
			return null;
		});
}

/**
 * 界面领取「Magpie 改由 Magpie 接入」的提示:本次启动删过旧配置才有,且只给一次,
 * 免得窗口重新加载后又弹。迁移还没跑完时会等它跑完。
 */
export async function takeMagpieHandoverNotice(): Promise<LegacyMagpieRemoval | null> {
	if (!pending) return null;
	const result = await pending;
	pending = Promise.resolve(null);
	return result;
}
