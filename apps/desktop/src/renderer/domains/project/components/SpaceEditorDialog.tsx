import { SPACE_ICON_VALUES, SPACE_ICONS, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import type { SpaceIconValue } from "@shared/store/spaces";
import { SpaceEditorDialogView } from "@vetta-org/theme-ui/settings";
import { useLocation } from "@tanstack/react-router";
import { useAtom, useStore } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { moveSpaceItem, useSpaceNavigation } from "../hooks/useSpaceNavigation";

type SpaceEditor = NonNullable<ReturnType<typeof spaceEditorAtom.read>>;

export function SpaceEditorDialog(): JSX.Element | null {
	const [editor, setEditor] = useAtom(spaceEditorAtom);
	return editor ? <SpaceEditor key={editor.space?.id ?? "new"} editor={editor} onClose={() => setEditor(null)} /> : null;
}

function SpaceEditor({ editor, onClose }: { editor: SpaceEditor; onClose: () => void }): JSX.Element {
	const { t } = useTranslation("project");
	const store = useStore();
	const pathname = useLocation({ select: (location) => location.pathname });
	const switchSpace = useSpaceNavigation();
	const [name, setName] = useState(editor.space?.name ?? "");
	const [icon, setIcon] = useState<SpaceIconValue>(
		editor.space?.icon.kind === "solar" ? editor.space.icon.value : SPACE_ICON_VALUES[0],
	);
	const id = editor.space?.id;
	const canSave = Boolean(name.trim());
	const save = (): void => {
		if (!canSave) return;
		const space = { id: id ?? crypto.randomUUID(), name: name.trim(), icon: { kind: "solar" as const, value: icon } };
		store.set(spacesAtom, (state) => ({
			...state,
			spaces: id
				? state.spaces.map((item) => {
						if (item.id !== id) return item;
						return { ...item, name: space.name, icon: space.icon };
					})
				: [...state.spaces, space],
		}));
		if (editor.move) moveSpaceItem(store, pathname, editor.move, space.id);
		else if (!id) void switchSpace(space.id);
		onClose();
	};
	return (
		<SpaceEditorDialogView
			labels={{
				title: t(id ? "spaces.edit" : "spaces.new"),
				description: t("spaces.editorDescription"),
				name: t("spaces.name"),
				namePlaceholder: t("spaces.name"),
				icon: t("spaces.icon"),
				cancel: t("spaces.cancel"),
				save: t("spaces.save"),
			}}
			name={name}
			icons={SPACE_ICON_VALUES.map((value) => ({
				value,
				label: t(`spaces.icons.${value}`),
				iconClassName: SPACE_ICONS[value],
			}))}
			selectedIcon={icon}
			canSave={canSave}
			onNameChange={setName}
			onSelectIcon={(value) => setIcon(value as SpaceIconValue)}
			onCancel={onClose}
			onSave={save}
		/>
	);
}
