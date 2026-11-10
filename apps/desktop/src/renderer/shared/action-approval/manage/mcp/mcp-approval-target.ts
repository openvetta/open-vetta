export interface McpApprovalTarget {
	readonly scope?: "global" | "project";
	/** 项目根。注意它不是 `data.cwd`（server 进程的工作目录）。 */
	readonly cwd?: string;
}

export function readMcpApprovalTarget(record: Record<string, unknown>): McpApprovalTarget {
	return {
		...(record.scope === "global" || record.scope === "project" ? { scope: record.scope } : {}),
		...(typeof record.cwd === "string" && record.cwd ? { cwd: record.cwd } : {}),
	};
}

/**
 * 用户在弹窗里改完参数后会重建请求；落点必须原样带回，
 * 否则「只装进这个项目」会在确认的瞬间悄悄变成全局安装。
 */
export function mcpTargetPayload(target: McpApprovalTarget): { scope?: "global" | "project"; cwd?: string } {
	return {
		...(target.scope === undefined ? {} : { scope: target.scope }),
		...(target.cwd === undefined ? {} : { cwd: target.cwd }),
	};
}

export type McpLocation = { readonly kind: "global" } | { readonly kind: "project"; readonly path: string };

/** 只有显式 `scope: "project"` 才写项目文件；其余（含只给 cwd 的写操作）都落在全局。 */
export function describeMcpLocation(target: McpApprovalTarget): McpLocation {
	return target.scope === "project" && target.cwd ? { kind: "project", path: target.cwd } : { kind: "global" };
}
