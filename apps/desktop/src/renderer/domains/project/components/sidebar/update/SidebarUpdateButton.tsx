import { Button } from "@vetta-org/ui/button";
import { useSidebarUpdateButtonModel } from "./useSidebarUpdateButtonModel";

/** 主色实底加边缘呼吸涟漪（见 styles.css 的 .update-entry-ripple / .update-entry-glow）：更新入口必须一眼可见。 */
const UPDATE_ENTRY_CLASS =
	"no-drag relative rounded-full text-primary-foreground update-entry-ripple hover:text-primary-foreground";

/** 侧栏顶部的更新图标：仅在新版本下载就绪时出现，点击弹出带更新内容的对话框。 */
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
			className={UPDATE_ENTRY_CLASS}
		>
			<span aria-hidden="true" className="update-entry-glow absolute inset-0 rounded-full bg-primary" />
			<span aria-hidden="true" className="icon-[solar--arrow-down-linear] relative size-3.5" />
		</Button>
	);
}
