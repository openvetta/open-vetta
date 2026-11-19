import { atom } from "jotai";
import type { DesktopTeamSidebarConversation } from "../../../../shared/sidebar-conversation";

/**
 * 侧栏里可见的团队会话（最后一次加载的快照）。
 *
 * 由 `useTeamSidebarConversations` 写入：它是唯一的加载点，其余消费方（工作空间状态汇总等）
 * 读这里，避免各自再拉一次。
 */
export const teamSidebarConversationsAtom = atom<readonly DesktopTeamSidebarConversation[]>([]);
