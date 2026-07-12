import {
	BuiltinMcpSecretsDialogView as ThemeBuiltinMcpSecretsDialogView,
	type BuiltinMcpSecretsDialogViewLabels,
	type BuiltinMcpSecretsDialogViewProps as ThemeProps,
} from "@vetta/theme-ui/settings";
import type { BuiltinMcpSecretsDialogModel } from "./useBuiltinMcpSecretsDialogModel";

export type { BuiltinMcpSecretsDialogViewLabels };

export interface BuiltinMcpSecretsDialogViewProps extends BuiltinMcpSecretsDialogModel {
	readonly onConfirm: (values: Record<string, string>) => void;
	readonly onDefer?: () => void;
	readonly onOpenChange: (open: boolean) => void;
}

export function BuiltinMcpSecretsDialogView({
	allowDefer,
	canSubmit,
	fields,
	guideLines,
	hasFields,
	labels,
	onChangeValue,
	onConfirm,
	onDefer,
	onOpenChange,
	onOpenHelp,
	open,
	primaryHelpUrl,
	saving,
	values,
}: BuiltinMcpSecretsDialogViewProps): JSX.Element {
	const themeProps: ThemeProps = {
		allowDefer,
		canSubmit,
		fields,
		guideLines,
		hasFields,
		labels,
		onChangeValue,
		onConfirm,
		onDefer,
		onOpenChange,
		onOpenHelp,
		open,
		primaryHelpUrl,
		saving,
		values,
	};
	return <ThemeBuiltinMcpSecretsDialogView {...themeProps} />;
}
