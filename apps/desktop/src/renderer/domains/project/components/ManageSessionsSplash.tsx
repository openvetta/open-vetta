import { ManageSessionsSplashView } from "@vetta-org/theme-ui/project/ManageSessionsSplashView";
import { useManageSessionsModel } from "../hooks/useManageSessionsModel";
import type { ProjectsPanelModel } from "./sidebar/projects/panel/types";

interface ManageSessionsSplashProps {
	model: ProjectsPanelModel;
}

/** 「管理会话」：项目右键菜单与对话区 more 菜单的入口，批量查找、删除与更多操作都在这一个 Splash 里。 */
export function ManageSessionsSplash({ model }: ManageSessionsSplashProps): JSX.Element {
	return <ManageSessionsSplashView {...useManageSessionsModel(model)} />;
}
