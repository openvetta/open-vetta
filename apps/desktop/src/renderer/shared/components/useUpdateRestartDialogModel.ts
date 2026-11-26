import { useShortcutScope } from "@shared/shortcuts";
import { updaterCurrentNotesDialogOpenAtom, updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateRestartDialogViewProps } from "./UpdateRestartDialogView";

export type UpdateRestartDialogModel = UpdateRestartDialogViewProps;

const BANNER_SRC = "./update-banner.webp";
// GitHub 的发布列表只带最近约 10 版说明，落后更多版本时由这里看完整记录。
const RELEASES_URL = "https://github.com/openvetta/open-vetta/releases";

/**
 * 更新对话框的数据：同一个视图承载两种内容。
 * - 版本介绍（currentNotes 打开）：当前运行版本的发布说明，打包时随安装包带上。
 * - 更新（restart 打开）：按 updater 阶段显示检查中 / 已是最新 / 新版本 / 下载进度 / 立即重启 / 出错。
 */
export function useUpdateRestartDialogModel(): UpdateRestartDialogModel {
	const { t } = useTranslation("common");
	const [updateOpen, setUpdateOpen] = useAtom(updaterRestartDialogOpenAtom);
	const [notesOpen, setNotesOpen] = useAtom(updaterCurrentNotesDialogOpenAtom);
	const state = useAtomValue(updaterStateAtom);
	const overlayRef = useRef<HTMLDivElement>(null);
	// undefined = 读取中；null = 没有随包说明
	const [currentNote, setCurrentNote] = useState<string | null | undefined>(undefined);

	const visible = notesOpen || updateOpen;

	useEffect(() => {
		if (!notesOpen) return;
		let cancelled = false;
		setCurrentNote(undefined);
		window.vetta.updater
			.getCurrentReleaseNote()
			.then((note) => {
				if (!cancelled) setCurrentNote(note);
			})
			.catch(() => {
				if (!cancelled) setCurrentNote(null);
			});
		return () => {
			cancelled = true;
		};
	}, [notesOpen]);

	const close = () => {
		setNotesOpen(false);
		setUpdateOpen(false);
	};

	useShortcutScope({
		id: "modal:update-restart",
		kind: "modal",
		active: visible,
		exclusive: true,
		bindings: [{ key: "escape", run: close }],
	});

	const base = { bannerSrc: BANNER_SRC, closeLabel: t("updateDialog.close"), onClose: close, overlayRef, visible };

	if (notesOpen) {
		return {
			...base,
			emptyText: t("updateDialog.currentEmpty"),
			loading: currentNote === undefined,
			releaseNote: currentNote ?? undefined,
			subtitle: t("updateDialog.currentSubtitle"),
			title: t("updateDialog.currentTitle", { version: state.currentVersion }),
		};
	}

	const latest = state.latestVersion ?? "";
	// 跨多个版本更新：最新一版直接展示，更早的各版折叠，末尾给出完整更新记录的入口。
	const earlier = state.earlierReleaseNotes?.length
		? {
				earlierReleaseNotes: state.earlierReleaseNotes.map((item) => ({
					id: item.version,
					note: item.note,
					title: t("updateDialog.versionHeading", { version: item.version }),
				})),
				earlierTitle: t("updateDialog.earlierTitle"),
				viewAll: {
					label: t("updateDialog.viewAll"),
					onClick: () => void window.vetta.shell.openExternal(RELEASES_URL),
				},
			}
		: {};

	switch (state.phase) {
		case "checking":
			return {
				...base,
				status: { kind: "checking", text: t("updateDialog.checking") },
				subtitle: t("updateDialog.currentVersion", { version: state.currentVersion }),
				title: t("updateDialog.checkingTitle"),
			};
		case "available":
			return {
				...base,
				primary: {
					label: t("updateDialog.updateNow"),
					onClick: () => void window.vetta.updater.download(),
				},
				...earlier,
				releaseNote: state.releaseNote,
				subtitle: t("updateDialog.versionChange", { currentVersion: state.currentVersion, latestVersion: latest }),
				title: t("updateDialog.availableTitle", { version: latest }),
			};
		case "downloading": {
			const progress = state.progress ?? 0;
			return {
				...base,
				...earlier,
				releaseNote: state.releaseNote,
				status: {
					kind: "progress",
					progress,
					text: t("updateDialog.downloading", { progress: Math.round(progress * 100) }),
				},
				subtitle: t("updateDialog.versionChange", { currentVersion: state.currentVersion, latestVersion: latest }),
				title: t("updateDialog.downloadingTitle", { version: latest }),
			};
		}
		case "ready":
			return {
				...base,
				primary: {
					label: t("updateDialog.updateNow"),
					onClick: () => {
						close();
						void window.vetta.updater.install();
					},
				},
				...earlier,
				releaseNote: state.releaseNote,
				subtitle: t("updateDialog.readyMessage", { currentVersion: state.currentVersion, latestVersion: latest }),
				title: t("updateDialog.readyTitle", { version: latest }),
			};
		case "installing":
			return {
				...base,
				primary: { disabled: true, label: t("updateDialog.installing"), onClick: close },
				title: t("updateDialog.installingTitle"),
			};
		case "error":
			return {
				...base,
				primary: { label: t("updateDialog.retry"), onClick: () => void window.vetta.updater.check() },
				status: { kind: "error", text: state.error ?? t("updateDialog.errorFallback") },
				subtitle: t("updateDialog.currentVersion", { version: state.currentVersion }),
				title: t("updateDialog.errorTitle"),
			};
		default:
			return {
				...base,
				primary: {
					label: t("updateDialog.viewCurrent"),
					onClick: () => {
						setUpdateOpen(false);
						setNotesOpen(true);
					},
				},
				subtitle: t("updateDialog.currentVersion", { version: state.currentVersion }),
				title: t("updateDialog.latestTitle"),
			};
	}
}
