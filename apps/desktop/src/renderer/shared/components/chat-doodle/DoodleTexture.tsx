import { ChatDoodleBackdrop } from "./ChatDoodleBackdrop";

/**
 * 涂鸦：新会话页的纹理之一，即对话页那层细线图标墙纸铺到新会话页上。
 *
 * 与网格、涟漪同构——同样向外淡出、同样静止不动，但**不带那团环境光晕**：图案本身已经
 * 铺满整页，中间再压一团主色光就会和纹路糊在一起，把「密密麻麻的细线」糊成一片。
 * 渐隐用 `new-session` 而不是对话页那个上下渐隐，换纹理时页面重心才不会跳。
 */
export function DoodleTexture(): JSX.Element {
	return <ChatDoodleBackdrop fade="new-session" />;
}
