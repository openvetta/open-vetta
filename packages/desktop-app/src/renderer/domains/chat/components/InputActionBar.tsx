import { InputActionBarView } from "./InputActionBarView";
import { useInputActionBarModel } from "./useInputActionBarModel";

export function InputActionBar(): JSX.Element | null {
	const model = useInputActionBarModel();

	if (!model.visible) return null;

	return <InputActionBarView model={model} />;
}
