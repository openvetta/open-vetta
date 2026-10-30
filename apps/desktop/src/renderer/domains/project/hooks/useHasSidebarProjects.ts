import { batchProjectsAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useProjects } from "./useProjects";

/** 侧边栏是否存在用户项目（不受类型筛选影响）；项目列表未就绪时按「有」处理，避免抬头闪烁。 */
export function useHasSidebarProjects(): boolean {
	const { projects, projectsInitialized } = useProjects();
	const batchProjects = useAtomValue(batchProjectsAtom);
	if (!projectsInitialized) return true;
	return (
		projects.some((project) => project.type !== "batch" && !project.isDefault) ||
		batchProjects.some((project) => project.tasks.some((task) => task.sessionPath))
	);
}
