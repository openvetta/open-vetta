import { useThemeComponent } from "@vetta-org/theme-sdk";
import { type ModelSelectorTriggerVariant, ModelSelectorView } from "@vetta-org/theme-ui/chat";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type ModelPickerReasoning, useModelPickerModel } from "./useModelPickerModel";
import type { ModelOption } from "./useModelOptions";

/** Optional reasoning-level column for a model picker. Controlled by the caller. */
export type ModelSelectReasoning = ModelPickerReasoning;

export interface ModelSelectProps {
	/** Currently selected key ("provider/modelId"), or null when unset */
	value: string | null;
	/** Fired on selection; null only when allowClear and the user clears */
	onChange: (key: string | null) => void;
	/** Show an explicit "unset" entry so the selection can be cleared */
	allowClear?: boolean;
	clearLabel?: string;
	ariaLabel?: string;
	disabled?: boolean;
	/** Trigger text when nothing is selected (defaults to common placeholder) */
	placeholder?: string;
	/** Extra classes for the trigger button (sizing/shape per call site) */
	triggerClassName?: string;
	/** 触发器形态；表单里默认 `field`（带边框的选择框）。 */
	variant?: ModelSelectorTriggerVariant;
	/** 打「默认」徽章的模型；缺省为全局默认模型。 */
	defaultKey?: string;
	/** When value is empty, auto-apply the configured default model once */
	autoSelectDefault?: boolean;
	/** Fires whenever the resolved selected option changes (load + change) */
	onSelectedOptionChange?: (option: ModelOption | null) => void;
	/** When set, adds a reasoning-level column for the selected model. */
	reasoning?: ModelSelectReasoning;
}

/**
 * 受控的模型选择器（设置页、审批卡、定时任务、批量任务、团队成员、插件表单…）。
 *
 * 与输入栏右下角的选择器是同一个视图、同一份目录（useModelPickerModel），只在「选中写到哪」
 * 和触发器形态上不同。主题对 `chat.modelSelectorView` 的覆盖在这里同样生效。
 */
export function ModelSelect({
	value,
	onChange,
	allowClear = false,
	clearLabel,
	ariaLabel,
	disabled = false,
	placeholder,
	triggerClassName,
	variant = "field",
	defaultKey,
	autoSelectDefault = false,
	onSelectedOptionChange,
	reasoning,
}: ModelSelectProps): JSX.Element {
	const { t } = useTranslation("common");
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	const emptyLabel = allowClear ? (clearLabel ?? t("modelSelect.unset")) : undefined;
	const emptyOption = useMemo(() => (emptyLabel === undefined ? undefined : { label: emptyLabel }), [emptyLabel]);
	const model = useModelPickerModel({
		value,
		onChange: (key) => onChange(key),
		reasoning,
		emptyOption,
		placeholder,
		defaultKey,
		autoSelectDefault,
	});

	// Surface the resolved selected option to consumers (e.g. image support).
	const onSelectedOptionChangeRef = useRef(onSelectedOptionChange);
	onSelectedOptionChangeRef.current = onSelectedOptionChange;
	const optionCount = model.options.length;
	useEffect(() => {
		if (optionCount === 0) return;
		onSelectedOptionChangeRef.current?.(model.catalogOption);
	}, [model.catalogOption, optionCount]);

	if (model.empty) return <></>;
	return (
		<ThemedModelSelectorView
			{...model.viewProps}
			ariaLabel={ariaLabel}
			disabled={disabled}
			triggerVariant={variant}
			classNames={{ trigger: triggerClassName }}
		/>
	);
}
