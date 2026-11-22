import { atom } from "jotai";

/**
 * 需要用户回来看的会话路径：一轮跑完（成功或失败）还没打开，或卡在等用户处理。
 * 真值在主进程（与 Dock 角标同一份，见 main/notifications/dock-attention-badge.ts），
 * 用户正看着的会话不会进来，打开即移出；只存内存，重启清空。
 * 命令面板据此把「刚跑完、还没看」的会话留在「进行中」组，而不是一停止就消失。
 */
export const attentionSessionPathsAtom = atom<ReadonlySet<string>>(new Set<string>());
