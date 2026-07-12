import { BuiltinMcpSecretsDialogView } from "./BuiltinMcpSecretsDialogView";
import { useBuiltinMcpSecretsDialogModel } from "./useBuiltinMcpSecretsDialogModel";
import type { BuiltinMcpPreset } from "../mcp/builtin-mcp-presets";

export function BuiltinMcpSecretsDialog({
	open,
	preset,
	initialValues,
	saving,
	allowDefer,
	onOpenChange,
	onConfirm,
	onDefer,
}: {
	open: boolean;
	preset: BuiltinMcpPreset | null;
	initialValues?: Record<string, string>;
	saving?: boolean;
	allowDefer?: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (values: Record<string, string>) => void;
	onDefer?: () => void;
}): JSX.Element | null {
	const model = useBuiltinMcpSecretsDialogModel({
		open,
		preset,
		initialValues,
		saving,
		allowDefer,
	});
	if (!model) return null;
	return (
		<BuiltinMcpSecretsDialogView
			{...model}
			onConfirm={onConfirm}
			onDefer={onDefer}
			onOpenChange={onOpenChange}
		/>
	);
}
