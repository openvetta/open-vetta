import { useShortcutBinding } from "@shared/hooks/useShortcutBinding";
import { shortcutParts } from "@shared/lib/platform";
import { useThemeComponent } from "@vetta-org/theme-sdk";
import { ModelSelectorView } from "@vetta-org/theme-ui/chat/ModelSelectorView";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OPEN_MODEL_SELECTOR_EVENT } from "@/shared/shortcuts";
import { type ModelSelectorScope, useModelSelectorModel } from "../hooks/useModelSelectorModel";
import { ExecutionModeSelector } from "./ExecutionModeSelector";
import { useModelSelectorFooter } from "./model-selector-footer";

export function ModelSelector({
	updateActiveSession = true,
	scope,
}: {
	readonly updateActiveSession?: boolean;
	readonly scope?: ModelSelectorScope;
} = {}): JSX.Element {
	const model = useModelSelectorModel({ updateActiveSession, scope });
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	const footer = useModelSelectorFooter();

	// 有底栏的那个（输入栏里的）才响应快捷键，开合交给这里控制。
	const [open, setOpen] = useState(false);
	const openRef = useRef(open);
	openRef.current = open;
	const { onOpenChange } = model.viewProps;
	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			onOpenChange?.(next);
		},
		[onOpenChange],
	);
	const active = footer?.active ?? false;
	useEffect(() => {
		if (!active) return;
		const toggle = (): void => handleOpenChange(!openRef.current);
		window.addEventListener(OPEN_MODEL_SELECTOR_EVENT, toggle);
		return () => window.removeEventListener(OPEN_MODEL_SELECTOR_EVENT, toggle);
	}, [active, handleOpenChange]);

	if (model.empty) return <></>;
	if (!footer) return <ThemedModelSelectorView {...model.viewProps} />;
	return (
		<ThemedModelSelectorView
			{...model.viewProps}
			open={open}
			onOpenChange={handleOpenChange}
			footerStart={<ModelSelectorShortcutHint />}
			footerEnd={
				footer.executionMode ? (
					<ExecutionModeSelector
						model={{ ...footer.executionMode, showLabel: true, contentAlign: "end", className: "ml-0" }}
					/>
				) : undefined
			}
		/>
	);
}

/** 底栏左侧：打开/收起这个菜单的快捷键，随设置页的自定义实时变化。 */
function ModelSelectorShortcutHint(): JSX.Element {
	const { t } = useTranslation("common");
	const shortcut = useShortcutBinding("open-model-selector");
	return (
		<span className="flex items-center gap-1" title={t("modelSelect.shortcutHint")}>
			{shortcutParts(shortcut).map((part, index) => (
				<kbd
					// biome-ignore lint/suspicious/noArrayIndexKey: 组合键各段固定顺序，同一个键可能重复出现
					key={index}
					className="rounded border border-border/60 bg-muted/50 px-1 text-[10px] font-medium leading-4 text-muted-foreground"
				>
					{part}
				</kbd>
			))}
		</span>
	);
}
