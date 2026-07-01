import { activeSessionAtom, getTodoItemsForSession, todoItemsBySessionAtom } from "@shared/store/atoms";
import { TodoCard } from "@shared/components/TodoCard";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function TodoTabPanel(): JSX.Element {
	const { t } = useTranslation("chat");
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const items = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);

	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				{t("activityPanel.todo.empty")}
			</div>
		);
	}

	return <TodoCard items={items} />;
}
