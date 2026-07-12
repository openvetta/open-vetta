import { useThemeComponent } from "@vetta/theme-sdk";
import { useConfirmDialogModel } from "../../hooks/useConfirmDialogModel";
import { ConfirmDialogView } from "./ConfirmDialogView";

export function ConfirmDialog(): JSX.Element | null {
	const model = useConfirmDialogModel();
	const ThemedConfirmDialogView = useThemeComponent("root.confirmDialogView", ConfirmDialogView);
	return <ThemedConfirmDialogView {...model} />;
}
