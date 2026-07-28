import { memo } from "react";
import { InputActionBarView } from "./InputActionBarView";
import { useInputActionBarModel } from "./useInputActionBarModel";

export const InputActionBar = memo(function InputActionBar(): JSX.Element | null {
	const model = useInputActionBarModel();

	if (!model.visible) return null;

	return <InputActionBarView model={model} />;
});
