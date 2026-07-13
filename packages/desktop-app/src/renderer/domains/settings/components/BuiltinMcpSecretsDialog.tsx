import { BuiltinMcpSecretsDialogView } from "./BuiltinMcpSecretsDialogView";
import { useBuiltinMcpSecretsDialogModel } from "./useBuiltinMcpSecretsDialogModel";
import type { BuiltinMcpPreset } from "../mcp/builtin-mcp-presets";

export function BuiltinMcpSecretsDialog({
	open,
	preset,
	initialValues,
	saving,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	preset: BuiltinMcpPreset | null;
	initialValues?: Record<string, string>;
	saving?: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (values: Record<string, string>) => void;
}): JSX.Element | null {
	const model = useBuiltinMcpSecretsDialogModel({
		open,
		preset,
		initialValues,
		saving,
	});
	if (!model) return null;
	return (
		<BuiltinMcpSecretsDialogView {...model} onConfirm={onConfirm} onOpenChange={onOpenChange} />
	);
}
