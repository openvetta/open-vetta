import { conversationBucketCwd, type ProjectType } from "@shared/store/project-atoms";
import type { ConversationScenario } from "@vetta-org/plugin-sdk";

export interface ConversationScenarioInput {
	/** 会话使用的 cwd：新会话页传选中的项目根，其它调用方传实际会话 cwd。 */
	readonly cwd: string;
	/** 默认「对话」项目的根目录；未就绪 / 未知时传空值，此时不做归桶判断。 */
	readonly defaultConversationCwd: string | null | undefined;
	/** 已登记的批量项目，或批量任务自己的会话：无论 cwd 落在哪里都算批量。 */
	readonly batch?: boolean;
	/** 项目类型（`projectsAtom` 里的 `type`）。 */
	readonly projectType?: ProjectType;
}

/**
 * 会话场景的 UI 侧唯一推导。
 *
 * 主进程建会话时用 `resolveDesktopSessionConfig` 决定 scene，插件插槽（活动面板 tab、
 * 输入栏动作、顶栏动作）又按这个值做 fail-closed 过滤。两边必须给出同一个答案，否则
 * 「会话建出来是 project、页面却按 conversation 过滤」这类错位会让项目里已经存在的
 * 面板（如 Git）在新会话页和项目详情页整片消失。
 */
export function resolveConversationScenario({
	cwd,
	defaultConversationCwd,
	batch,
	projectType,
}: ConversationScenarioInput): ConversationScenario {
	if (batch || projectType === "batch") return "batch";
	// ADR-0007：「对话」项目的 session cwd 是项目根下的 per-session 子目录，按 bucket 归一回项目根。
	const defaultCwd = defaultConversationCwd ?? "";
	if (defaultCwd.length > 0 && conversationBucketCwd(cwd, defaultCwd) === defaultCwd) return "conversation";
	return "project";
}
