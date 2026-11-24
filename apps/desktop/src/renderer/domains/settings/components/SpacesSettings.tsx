import { deleteSpaceTeamSession, readSpaceRemoval, runningSpaceConversations } from "@domains/project/services/space-removal";
import type { SpaceRemovalContents } from "@domains/project/services/space-removal";
import { SpaceGlyph } from "@domains/project/components/sidebar/SpaceSwitcher";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
import { defaultConversationCwdAtom } from "@shared/store/atoms";
import { forgetSpace, MAIN_SPACE, MAIN_SPACE_ICON, reorderSpace, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import type { Space } from "@shared/store/spaces";
import { SpacesSettingsView } from "@vetta-org/theme-ui/settings";
import { Button } from "@vetta-org/ui/button";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const SPACES_SECTION = { id: "workspaces", titleKey: "spaces.settingsTitle" } as const;
/** 顶部讲解的四条，顺序即阅读顺序：怎么分 → 怎么切 → 切回来什么样 → 不会动什么。 */
const SPACES_FEATURES = [
	{ key: "group", icon: "icon-[solar--widget-linear]" },
	{ key: "switch", icon: "icon-[solar--square-transfer-horizontal-linear]" },
	{ key: "resume", icon: "icon-[solar--history-linear]" },
	{ key: "safe", icon: "icon-[solar--shield-check-linear]" },
] as const;

export function SpacesSettings(): JSX.Element {
	const { t } = useTranslation("project");
	const state = useAtomValue(spacesAtom);
	const setSpaces = useSetAtom(spacesAtom);
	const edit = useSetAtom(spaceEditorAtom);
	const [remove, setRemove] = useState<Space>();
	return (
		<>
			<SpacesSettingsView
				section={SPACES_SECTION}
				features={SPACES_FEATURES.map(({ icon, key }) => ({
					icon,
					title: t(`spaces.intro.${key}.title`),
					description: t(`spaces.intro.${key}.description`),
				}))}
				labels={{
					title: t("spaces.settingsTitle"),
					subtitle: t("spaces.intro.subtitle"),
					featuresTitle: t("spaces.intro.title"),
					listTitle: t("spaces.intro.listTitle"),
					newSpace: t("spaces.new"),
					edit: (name) => t("spaces.spaceEdit", { name }),
					remove: (name) => t("spaces.spaceRemove", { name }),
					main: { id: MAIN_SPACE, name: t("spaces.main"), icon: <SpaceGlyph icon={MAIN_SPACE_ICON} /> },
				}}
				spaces={state.spaces.map((space) => ({
					id: space.id,
					name: space.name,
					icon: <SpaceGlyph icon={space.icon} />,
				}))}
				onCreate={() => edit({})}
				onEdit={(id) => {
					const space = state.spaces.find((item) => item.id === id);
					if (space) edit({ space });
				}}
				onRemove={(id) => {
					const space = state.spaces.find((item) => item.id === id);
					if (space) setRemove(space);
				}}
				onReorder={(source, target) => setSpaces((current) => reorderSpace(current, source, target))}
			/>
			{remove && <RemoveSpaceDialog key={remove.id} space={remove} onClose={() => setRemove(undefined)} />}
		</>
	);
}

function RemoveSpaceDialog({ space, onClose }: { space: Space; onClose: () => void }): JSX.Element {
	const { t } = useTranslation("project");
	const store = useStore();
	const cwd = useAtomValue(defaultConversationCwdAtom);
	const [contents, setContents] = useState<SpaceRemovalContents>();
	const [destructive, setDestructive] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const [running, setRunning] = useState<string[]>([]);
	const [error, setError] = useState(false);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		let cancelled = false;
		void readSpaceRemoval(store.get(spacesAtom), space.id, cwd).then((items) => {
			if (!cancelled) setContents(items);
		}).catch(() => { if (!cancelled) setError(true); });
		return () => { cancelled = true; };
	}, [cwd, space.id, store]);
	const submit = async (): Promise<void> => {
		if (busy || (destructive && (confirmation !== space.name || !contents || !cwd))) return;
		setBusy(true);
		setError(false);
		setRunning([]);
		try {
			if (destructive) {
				const latest = await readSpaceRemoval(store.get(spacesAtom), space.id, cwd);
				setContents(latest);
				const working = await runningSpaceConversations(latest);
				if (working.length > 0) { setRunning(working); return; }
				for (const session of latest.sessions) await window.vetta.session.delete(session.path);
				for (const session of latest.teamSessions) await deleteSpaceTeamSession(session);
				for (const project of latest.projects) await window.vetta.project.remove(project.path);
			}
			store.set(spacesAtom, (state) => forgetSpace(state, space.id));
			onClose();
		} catch (failure) {
			console.error("[space] removal failed", failure);
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>{t("spaces.removeTitle", { name: space.name })}</DialogTitle>
				<DialogDescription>{t("spaces.removeDescription")}</DialogDescription>
			</DialogHeader>
			<form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-3">
				<label className="flex items-center gap-2 text-sm"><input type="radio" checked={!destructive} onChange={() => setDestructive(false)} />{t("spaces.remove")}</label>
				<label className="flex items-center gap-2 text-sm"><input type="radio" checked={destructive} onChange={() => setDestructive(true)} />{t("spaces.removeWithProjects")}</label>
				{destructive && <>
					{contents && <p className="text-sm text-muted-foreground">{t("spaces.removalImpact", { projects: contents.projects.length, sessions: contents.sessions.length + contents.teamSessions.length, archived: contents.archived.length })}</p>}
					<label className="grid gap-1 text-sm">{t("spaces.confirmName", { name: space.name })}<input className="rounded-md border bg-background p-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
					{running.length > 0 && <div role="alert" className="text-sm text-destructive"><p>{t("spaces.running")}</p><ul className="list-disc pl-5">{running.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}</ul></div>}
				</>}
				{error && <p role="alert" className="text-sm text-destructive">{t("spaces.error")}</p>}
				<DialogFooter>
					<Button variant="ghost" type="button" disabled={busy} onClick={onClose}>{t("spaces.cancel")}</Button>
					<Button variant={destructive ? "destructive" : "default"} type="submit" disabled={busy || (destructive && (!contents || confirmation !== space.name))}>{t(destructive ? "spaces.removeWithProjects" : "spaces.remove")}</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}
