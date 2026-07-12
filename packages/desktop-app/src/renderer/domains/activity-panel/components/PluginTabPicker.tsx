import { useTranslation } from "react-i18next";
import {
	DEFAULT_PLUGIN_TAB_ICON,
	PluginTabPickerView,
	type HiddenTabEntryView,
} from "@vetta/theme-ui/activity";

export { DEFAULT_PLUGIN_TAB_ICON };

/** "+"下拉中可恢复显示的已隐藏内置/动态 tab。 */
export type HiddenTabEntry = HiddenTabEntryView;

interface PluginTabPickerProps {
	/** 当前被隐藏、可点击恢复的 tab（内置/动态/插件统一） */
	hiddenTabs: HiddenTabEntry[];
	/** 恢复（取消隐藏）某个 tab */
	onRestore: (key: string) => void;
	/** 因宽度不足被响应式收纳、未显示在标签栏上的页签（点击激活并自动让其挤回栏内） */
	overflowTabs: HiddenTabEntry[];
	/** 激活某个被收纳的页签 */
	onSelectOverflow: (key: string) => void;
}

/**
 * 活动面板 tab 栏右侧的下拉按钮：列出因宽度收纳的页签（点击激活）与被手动隐藏的页签
 * （点击恢复）。有收纳项时常显，否则 hover tab 栏才浮现。
 */
export function PluginTabPicker({
	hiddenTabs,
	onRestore,
	overflowTabs,
	onSelectOverflow,
}: PluginTabPickerProps): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<PluginTabPickerView
			hiddenTabs={hiddenTabs}
			onRestore={onRestore}
			overflowTabs={overflowTabs}
			onSelectOverflow={onSelectOverflow}
			labels={{
				menu: t("tabPicker.menu"),
				moreTabs: t("tabPicker.moreTabs"),
				hiddenPanels: t("tabPicker.hiddenPanels"),
			}}
		/>
	);
}
