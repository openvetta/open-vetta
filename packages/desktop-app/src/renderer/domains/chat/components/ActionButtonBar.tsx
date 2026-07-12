import { ActionButtonBarView } from "@vetta/theme-ui/chat";
import { useActionButtonBarModel } from "../hooks/useActionButtonBarModel";

export function ActionButtonBar(): JSX.Element | null {
	const model = useActionButtonBarModel();
	if (!model) return null;
	return <ActionButtonBarView buttons={model.buttons} onClick={model.onClick} />;
}
