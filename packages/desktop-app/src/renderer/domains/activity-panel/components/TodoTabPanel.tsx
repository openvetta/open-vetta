import { getTodoItemsForCwd, todoItemsByCwdAtom } from "@shared/store/atoms";
import { TodoCard } from "@shared/components/TodoCard";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

interface TodoTabPanelProps {
	cwd: string;
}

export function TodoTabPanel({ cwd }: TodoTabPanelProps): JSX.Element {
	const todoMap = useAtomValue(todoItemsByCwdAtom);
	const items = useMemo(() => getTodoItemsForCwd(todoMap, cwd), [todoMap, cwd]);

	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				暂无待办事项
			</div>
		);
	}

	return <TodoCard items={items} />;
}
