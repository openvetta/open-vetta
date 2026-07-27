/**
 * 能力安装台账（`~/.vetta/abilities.json`）：desktop 侧「装了哪些能力、什么版本」的单一索引。
 * 它只是索引不是安装位置——产物仍分别落在 skills/ scene/ plugins/ 与 agent/mcp.json（ADR-0049）。
 * bundle 不进台账：其状态全部由成员派生。
 */
export type AbilityLedgerType = "skill" | "scene" | "plugin" | "mcp";

export interface AbilityLedgerEntry {
	/** 已安装到本地的版本；与市场版本比对即得「是否可更新」。 */
	version: string;
	/** 首次安装时间（ISO 8601）；重装升级不重置。 */
	installedAt: string;
}

/** 键为 `<type>:<slug>`，例如 `skill:figma-ui`、`mcp:github`。 */
export type AbilityLedger = Record<string, AbilityLedgerEntry>;

export interface DesktopAbilitiesApi {
	/** 一次性读取全量台账；读取时会剔除实际已不存在的漂移条目。 */
	getLedger(): Promise<AbilityLedger>;
	/**
	 * 记录一次市场 MCP 能力的安装/升级。
	 * skill / scene / plugin 的写入由各自主进程安装流程完成，mcp 的写入路径在渲染层
	 * （整份 mcp.json 覆写），故单独开这条通道；server 不在 mcp.json 时不落账。
	 */
	recordMcpInstall(slug: string, version: string): Promise<void>;
}
