import { ModelSelect } from "@shared/components/ModelSelect";
import type { PluginModelPickerProps } from "@vetta-org/plugin-sdk";
import type { JSX } from "react";

/**
 * 经 host bridge 交给插件的模型选择器（plugin-sdk 的 `ModelPicker`）。
 *
 * 就是宿主自己用的 ModelSelect：同一份目录、同一个视图、同一份收藏，插件只决定选中值写到哪。
 * 这里只做插件合同到宿主 props 的映射，别在这里长出插件专属的行为。
 */
export function PluginModelPicker({
	value,
	onChange,
	reasoning,
	emptyOption,
	placeholder,
	defaultModelKey,
	autoSelectDefault,
	disabled,
	ariaLabel,
	variant,
	className,
	menuClassName,
}: PluginModelPickerProps): JSX.Element {
	return (
		<ModelSelect
			value={value}
			onChange={onChange}
			reasoning={reasoning}
			allowClear={emptyOption !== undefined}
			clearLabel={emptyOption?.label}
			placeholder={placeholder}
			defaultKey={defaultModelKey}
			autoSelectDefault={autoSelectDefault}
			disabled={disabled}
			ariaLabel={ariaLabel}
			variant={variant}
			triggerClassName={className}
			menuClassName={menuClassName}
		/>
	);
}
