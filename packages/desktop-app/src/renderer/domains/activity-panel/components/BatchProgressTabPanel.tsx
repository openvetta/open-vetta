import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { batchProjectsAtom } from "@shared/store/atoms";
import { BatchQueueStatus } from "@domains/project/components/BatchQueueStatus";

interface BatchProgressTabPanelProps {
	cwd: string;
}

export function BatchProgressTabPanel({ cwd }: BatchProgressTabPanelProps): JSX.Element {
	const batchProjects = useAtomValue(batchProjectsAtom);
	const project = useMemo(() => batchProjects.find((item) => item.id === cwd), [batchProjects, cwd]);

	if (!project) {
		return (
			<div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/50">
				未找到批量任务项目
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto px-3 py-3">
			<BatchQueueStatus project={project} />
		</div>
	);
}
