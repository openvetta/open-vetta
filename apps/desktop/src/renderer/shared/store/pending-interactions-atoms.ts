import { atom } from "jotai";

/**
 * 正在等用户处理的会话（key 为 sessionPath）→ 剩余待处理请求数。
 *
 * 覆盖四类会「卡住 agent」的交互：提问、计划审批、MCP 询问、沙箱授权。主进程统一维护并广播，
 * 侧栏据此把旋转中的会话图标换成问号，并给所属项目 / 工作空间点灯。
 *
 * 不能只看 `pendingQuestionsAtom`：那份按 runtimeId 索引，是给输入栏接管面板用的，
 * 窗口重载后与 sessionPath 的对应关系就断了，而这里是主进程持有的路径级真值。
 */
export const pendingInteractionPathsAtom = atom<Map<string, number>>(new Map<string, number>());
