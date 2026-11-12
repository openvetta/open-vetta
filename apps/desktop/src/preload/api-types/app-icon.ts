import type { AppIconId } from "../../shared/app-icon.js";

export interface DesktopAppIconApi {
	/** 当前应用图标 id。 */
	get(): Promise<AppIconId>;
	/** 设置图标；未知 id 回落默认，返回实际生效的 id。 */
	set(id: AppIconId): Promise<AppIconId>;
	/** 订阅图标变化。返回取消订阅函数。 */
	onChanged(handler: (id: AppIconId) => void): () => void;
}
