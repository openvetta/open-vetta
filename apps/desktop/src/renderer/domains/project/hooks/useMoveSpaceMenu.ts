import type { SpaceItem } from "@shared/store/spaces";
import { MAIN_SPACE, spaceEditorAtom, spaceOf, spacesAtom } from "@shared/store/spaces";
import { useLocation } from "@tanstack/react-router";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { useStore } from "jotai";
import { useTranslation } from "react-i18next";
import { moveSpaceItem } from "./useSpaceNavigation";

export function useMoveSpaceMenu(item: SpaceItem | undefined, onClose: () => void): ContextMenuNode | undefined {
	const { t } = useTranslation("project");
	const store = useStore();
	const pathname = useLocation({ select: (location) => location.pathname });
	if (!item) return undefined;
	const state = store.get(spacesAtom);
	const owner = spaceOf(state, item);
	const targets = [{ id: MAIN_SPACE, name: t("spaces.main") }, ...state.spaces];
	return {
		kind: "submenu",
		id: "move-space",
		label: t("spaces.move"),
		iconClassName: "icon-[solar--widget-linear]",
		items: [
			...targets.map(
				({ id, name }): ContextMenuNode => ({
					kind: "item",
					id,
					label: name,
					checked: id === owner,
					onSelect: () => {
						moveSpaceItem(store, pathname, item, id);
						onClose();
					},
				}),
			),
			{ kind: "separator", id: "new-space-divider" },
			{
				kind: "item",
				id: "new-space",
				label: t("spaces.new"),
				iconClassName: "icon-[solar--add-circle-linear]",
				onSelect: () => {
					onClose();
					store.set(spaceEditorAtom, { move: item });
				},
			},
		],
	};
}
