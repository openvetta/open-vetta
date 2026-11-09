import { useEffect, useState } from "react";
import {
	getEffectiveShortcut,
	loadShortcutBindings,
	type ShortcutActionId,
	type ShortcutBindings,
} from "../lib/shortcuts";

/**
 * 某个全局快捷键当前生效的组合键（用户自定义优先，否则默认值）。
 * 设置页改键后经主进程广播实时更新，供界面上的快捷键提示保持一致。
 */
export function useShortcutBinding(actionId: ShortcutActionId): string {
	const [bindings, setBindings] = useState<ShortcutBindings>({});

	useEffect(() => {
		let alive = true;
		void loadShortcutBindings().then((loaded) => {
			if (alive) setBindings(loaded);
		});
		const unsubscribe = window.vetta.config.onShortcutsChanged((event) => {
			setBindings(event.bindings ?? {});
		});
		return () => {
			alive = false;
			unsubscribe();
		};
	}, []);

	return getEffectiveShortcut(actionId, bindings);
}
