import { Button } from "@vetta-org/ui/button";
import { useSidebarUpdateButtonModel } from "./useSidebarUpdateButtonModel";

/** 侧栏顶部的更新图标：仅在新版本下载就绪时出现，点击弹出带更新内容的对话框。 */
export function SidebarUpdateButton(): JSX.Element | null {
	const model = useSidebarUpdateButtonModel();

	if (!model) return null;

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			onClick={model.onOpen}
			title={model.label}
			aria-label={model.label}
			className="no-drag"
		>
			<span aria-hidden="true" className="icon-[solar--download-minimalistic-linear] size-4" />
		</Button>
	);
}
