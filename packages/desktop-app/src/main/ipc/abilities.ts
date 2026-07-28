import { ipcMain } from "electron";
import { readAbilityLedger, recordAbilityInstall } from "../abilities/ability-ledger.js";
import { getOpenMarketplaceService } from "../abilities/open-marketplace/open-marketplace-service.js";
import { readMcpConfig } from "../mcp/mcp-settings-service.js";

export function registerAbilitiesIpc(): () => void {
	// 一次性下发全量台账；读取时顺带剔除漂移条目（ADR-0049）。
	ipcMain.handle("vetta:abilities:get-ledger", () => readAbilityLedger());
	ipcMain.handle("vetta:abilities:list-open-marketplace", () => getOpenMarketplaceService().list());
	ipcMain.handle("vetta:abilities:refresh-open-marketplace", () => getOpenMarketplaceService().refresh());
	ipcMain.handle("vetta:abilities:install-open-ability", async (_event, type: unknown, slug: unknown) => {
		if ((type !== "skill" && type !== "scene") || typeof slug !== "string" || !slug.trim()) {
			throw new Error("installOpenAbility requires a skill/scene type and non-empty slug");
		}
		await getOpenMarketplaceService().install(type, slug);
	});

	// 市场 MCP 装完后补记台账：mcp.json 由渲染层整份覆写，主进程无从得知市场版本。
	// 只接受确实已写进 mcp.json 的 server，避免渲染层写出幽灵条目。
	ipcMain.handle("vetta:abilities:record-mcp-install", async (_event, slug: unknown, version: unknown) => {
		if (typeof slug !== "string" || typeof version !== "string") {
			throw new Error("recordMcpInstall requires slug and version strings");
		}
		if (!slug.trim() || !version.trim()) return;
		const config = await readMcpConfig();
		if (!config.mcpServers[slug]) return;
		recordAbilityInstall("mcp", slug, version);
	});

	return () => {
		ipcMain.removeHandler("vetta:abilities:get-ledger");
		ipcMain.removeHandler("vetta:abilities:record-mcp-install");
		ipcMain.removeHandler("vetta:abilities:list-open-marketplace");
		ipcMain.removeHandler("vetta:abilities:refresh-open-marketplace");
		ipcMain.removeHandler("vetta:abilities:install-open-ability");
	};
}
