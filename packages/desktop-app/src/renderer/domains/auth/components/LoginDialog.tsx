import { useThemeComponent } from "@vetta/theme-sdk";
import { LoginDialogView } from "./LoginDialogView";
import { useLoginDialogModel } from "./useLoginDialogModel";

export function LoginDialog(): JSX.Element {
	const model = useLoginDialogModel();
	const ThemedLoginDialogView = useThemeComponent("root.loginDialogView", LoginDialogView);
	return <ThemedLoginDialogView {...model} />;
}
