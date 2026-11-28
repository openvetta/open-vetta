import { BrowserSelectionView } from "@vetta-org/theme-ui/activity";
import { BrowserPanelView } from "@vetta-org/theme-ui/activity/BrowserPanelView";
import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { BrowserCaptureDialog } from "@shared/components/BrowserCaptureDialog";
import { activeInputDraftKeyAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useBrowserCapture } from "../hooks/useBrowserCapture";
import { useBrowserPanelModel } from "../hooks/useBrowserPanelModel";

/**
 * 工作空间级内置浏览器：单 webview 的临时预览窗。
 * - 按 workspaceId 隔离：切工作空间时 webview 重挂载并加载该工作空间存的 URL。
 * - 跨活动 tab 保活由 ActivityPanel 负责（常驻挂载 + CSS 隐藏，不条件卸载）。
 */
export function BrowserPanel(): JSX.Element {
	const model = useBrowserPanelModel();
	const capture = useBrowserCapture(model.webviewRef, model.workspaceId);
	const { t } = useTranslation("chat");
	const draftKey = useAtomValue(activeInputDraftKeyAtom);
	// 选择模式的操作浮在网页上方，退出即消失，网页区域高度不随之变化。
	const selectionToolbar = capture.mode ? (
		<ButtonGroup aria-label={t("browserCapture.hint")}>
			{capture.mode === "element" && (
				<>
					<ButtonGroupItem
						label={t("browserCapture.expand")}
						disabled={!capture.locked || capture.busy || capture.level >= (capture.inspection?.elements.length ?? 0) - 1}
						onClick={capture.expand}
					/>
					<ButtonGroupItem
						label={t("browserCapture.shrink")}
						disabled={!capture.locked || capture.busy || capture.level === 0}
						onClick={capture.shrink}
					/>
				</>
			)}
			<ButtonGroupItem
				active
				label={t(capture.busy ? "browserCapture.busy" : "browserCapture.confirm")}
				disabled={
					capture.busy ||
					!capture.rect ||
					capture.rect.width < 2 ||
					capture.rect.height < 2 ||
					(capture.mode === "element" && !capture.locked)
				}
				onClick={capture.confirm}
			/>
			<ButtonGroupItem label={t("browserCapture.cancel")} onClick={capture.cancel} />
		</ButtonGroup>
	) : null;
	return (
		<>
			<BrowserPanelView
				{...model}
				captureAction={{
					label: t("browserCapture.select"),
					disabled: !draftKey || !model.hasPage || model.loading || model.failed || !!capture.mode,
					onClick: capture.start,
				}}
			>
				{capture.mode && (
					<BrowserSelectionView
						mode={capture.mode}
						viewport={capture.inspection?.viewport ?? { width: 1, height: 1 }}
						rect={capture.rect}
						disabled={capture.busy || !capture.inspection}
						label={t("browserCapture.hint")}
						onInspect={capture.inspect}
						onRegionChange={capture.setRegion}
						onScroll={capture.scroll}
						toolbar={selectionToolbar}
					/>
				)}
			</BrowserPanelView>
			{capture.preview && (
				<BrowserCaptureDialog capture={capture.preview} onCancel={capture.cancel} onSave={capture.add} />
			)}
		</>
	);
}
