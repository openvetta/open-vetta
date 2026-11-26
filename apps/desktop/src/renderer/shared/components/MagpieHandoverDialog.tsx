import { MagpieHandoverDialogView } from "@vetta-org/theme-ui/overlays";
import { ProviderIcon } from "@vetta-org/theme-ui/shared";
import { useMagpieHandoverDialogModel } from "./useMagpieHandoverDialogModel";

const VETTA_ICON_SRC = "./icon.png";

/** 升级后告诉老用户:Magpie 改由 Magpie 在其 Agents 页接入 Vetta。 */
export function MagpieHandoverDialog(): JSX.Element {
	const model = useMagpieHandoverDialogModel();
	return (
		<MagpieHandoverDialogView
			{...model}
			vettaIcon={<img src={VETTA_ICON_SRC} alt="Vetta" draggable={false} className="size-full object-cover select-none" />}
			magpieIcon={<ProviderIcon symbol="magpie" className="size-10" />}
		/>
	);
}
