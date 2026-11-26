import { diagnosticsExportDialogOpenAtom } from "@shared/store/diagnostics-export-atoms";
import type { DiagnosticsExportDialogPhase, DiagnosticsExportDialogViewLabels } from "@vetta-org/theme-ui/overlays";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMac, isWindows } from "../lib/platform";

/** GitHub 的 Bug 反馈模板：反馈渠道之一，用户也可以私下把诊断包发给开发者。 */
export const DIAGNOSTICS_ISSUE_URL = "https://github.com/openvetta/open-vetta/issues/new?template=bug-report.yml";

export interface DiagnosticsExportDialogModel {
	readonly visible: boolean;
	readonly phase: DiagnosticsExportDialogPhase;
	readonly savedFileName?: string;
	readonly errorMessage?: string;
	readonly labels: DiagnosticsExportDialogViewLabels;
	readonly onExport: () => void;
	readonly onShowInFolder: () => void;
	readonly onOpenIssue: () => void;
	readonly onClose: () => void;
}

/**
 * 「导出诊断包」引导弹窗：点导出后由主进程弹系统保存对话框，用户选好位置才打包写出。
 * 取消保存回到初始状态；每次重新打开弹窗都从头开始。
 */
export function useDiagnosticsExportDialogModel(): DiagnosticsExportDialogModel {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(diagnosticsExportDialogOpenAtom);
	const [phase, setPhase] = useState<DiagnosticsExportDialogPhase>("idle");
	const [savedPath, setSavedPath] = useState<string>();
	const [errorMessage, setErrorMessage] = useState<string>();
	const exportingRef = useRef(false);

	useEffect(() => {
		if (!open) return;
		setPhase("idle");
		setSavedPath(undefined);
		setErrorMessage(undefined);
	}, [open]);

	const onExport = useCallback(() => {
		if (exportingRef.current) return;
		exportingRef.current = true;
		setPhase("exporting");
		setErrorMessage(undefined);
		window.vetta.diagnostics
			.exportDiagnosticsPackage({ dialogTitle: t("diagnosticsExport.saveDialogTitle") })
			.then((result) => {
				if (result.canceled) {
					setPhase("idle");
					return;
				}
				setSavedPath(result.zipPath);
				setPhase("done");
			})
			.catch((error: unknown) => {
				console.error("[DiagnosticsExport] failed to export diagnostics:", error);
				setErrorMessage(error instanceof Error ? error.message : String(error));
				setPhase("error");
			})
			.finally(() => {
				exportingRef.current = false;
			});
	}, [t]);

	const onShowInFolder = useCallback(() => {
		if (savedPath) void window.vetta.shell.showItemInFolder(savedPath);
	}, [savedPath]);

	const onOpenIssue = useCallback(() => {
		void window.vetta.shell.openExternal(DIAGNOSTICS_ISSUE_URL);
	}, []);

	const onClose = useCallback(() => setOpen(false), [setOpen]);

	return {
		visible: open,
		phase,
		savedFileName: savedPath,
		errorMessage,
		labels: {
			eyebrow: t("diagnosticsExport.eyebrow"),
			title: t("diagnosticsExport.title"),
			description: t("diagnosticsExport.description"),
			noCollection: t("diagnosticsExport.noCollection"),
			contentsTitle: t("diagnosticsExport.contentsTitle"),
			contentsLogs: t("diagnosticsExport.contentsLogs"),
			contentsRecentLogs: t("diagnosticsExport.contentsRecentLogs"),
			contentsSystem: t("diagnosticsExport.contentsSystem"),
			privacyNote: t("diagnosticsExport.privacyNote"),
			stepsTitle: t("diagnosticsExport.stepsTitle"),
			stepExport: t("diagnosticsExport.stepExport"),
			stepDescribe: t("diagnosticsExport.stepDescribe"),
			stepAttach: t("diagnosticsExport.stepAttach"),
			export: t("diagnosticsExport.export"),
			exporting: t("diagnosticsExport.exporting"),
			saved: t("diagnosticsExport.saved"),
			showInFolder: isMac
				? t("diagnosticsExport.showInFinder")
				: isWindows
					? t("diagnosticsExport.showInExplorer")
					: t("diagnosticsExport.showInFolder"),
			failed: t("diagnosticsExport.failed"),
			openIssue: t("diagnosticsExport.openIssue"),
			close: t("diagnosticsExport.close"),
		},
		onExport,
		onShowInFolder,
		onOpenIssue,
		onClose,
	};
}
