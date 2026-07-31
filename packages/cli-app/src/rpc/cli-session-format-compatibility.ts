import { LegacyRuntimeSessionCatalog } from "@vetta/coding-agent/runtime-host";
import { CompositeRuntimeSessionCatalog, type RuntimeSessionCatalog } from "@vetta/runtime-core";
import { FileConversationRuntimeSessionCatalog } from "@vetta/runtime-storage/conversation";

export interface CliRuntimeSessionCatalogOptions {
	readonly cwd: string;
	readonly sessionDir: string;
}

/** CLI 会话选择使用的格式兼容组合；不创建或恢复活动 Session。 */
export function createCliRuntimeSessionCatalog(options: CliRuntimeSessionCatalogOptions): RuntimeSessionCatalog {
	return new CompositeRuntimeSessionCatalog([
		new LegacyRuntimeSessionCatalog(),
		new FileConversationRuntimeSessionCatalog({
			roots: [{ cwd: options.cwd, sessionDir: options.sessionDir }],
		}),
	]);
}
