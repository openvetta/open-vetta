import { ToasterView } from "@vetta-org/theme-ui/overlays/ToasterView";
import { createPortal } from "react-dom";
import { useToasterModel } from "../../hooks/useToasterModel";

export function Toaster(): JSX.Element {
	// 挂在 AppFrame（`isolate`）下时 z-[200] 出不了它的层叠上下文，
	// 打开中的 Dialog（portal 到 body）会把提示盖在遮罩下面，如填 key 失败的报错。
	return createPortal(<ToasterView {...useToasterModel()} />, document.body);
}
