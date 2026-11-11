import { Button } from "@vetta-org/ui/button";
import { useSidebarUpdateButtonModel } from "./useSidebarUpdateButtonModel";

/** 侧栏底部的更新图标：仅在新版本下载就绪时出现，点击弹出带更新内容的对话框。 */
export function SidebarUpdateButton(): JSX.Element | null {
	const model = useSidebarUpdateButtonModel();

	if (!model) return null;

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			onClick={model.onOpen}
			title={model.label}
			aria-label={model.label}
			className="no-drag hover:bg-transparent hover:opacity-80"
		>
			<span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/20">
				<span className="icon-[solar--arrow-down-linear] h-3.5 w-3.5" />
			</span>
		</Button>
	);
}
