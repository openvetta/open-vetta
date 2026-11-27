import { BrowserSelectionView } from "@vetta-org/theme-ui/activity";
import { BrowserPanelView } from "@vetta-org/theme-ui/activity/BrowserPanelView";
import { BrowserCaptureDialog } from "@shared/components/BrowserCaptureDialog";
import { Button } from "@shared/components/ui/button";
import { activeInputDraftKeyAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useBrowserCapture } from "../hooks/useBrowserCapture";
import { useBrowserPanelModel } from "../hooks/useBrowserPanelModel";

export function BrowserPanel(): JSX.Element {
	const model = useBrowserPanelModel();
	const capture = useBrowserCapture(model.webviewRef, model.workspaceId);
	const { t } = useTranslation("chat");
	const draftKey = useAtomValue(activeInputDraftKeyAtom);
	return (
		<>
			<BrowserPanelView
				{...model}
				captureAction={{
					label: t("browserCapture.select"),
					disabled: !draftKey || !model.hasPage || model.loading || model.failed || !!capture.mode,
					onClick: capture.start,
				}}
				captureToolbar={capture.mode && (
					<div
						role="toolbar"
						aria-label={t("browserCapture.hint")}
						className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-border p-1"
					>
						{capture.mode === "element" && (
							<>
								<Button
									size="sm"
									variant="ghost"
									disabled={
										!capture.locked || capture.busy || capture.level >= (capture.inspection?.elements.length ?? 0) - 1
									}
									onClick={capture.expand}
								>
									{t("browserCapture.expand")}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={!capture.locked || capture.busy || capture.level === 0}
									onClick={capture.shrink}
								>
									{t("browserCapture.shrink")}
								</Button>
							</>
						)}
						<Button
							size="sm"
							disabled={
								capture.busy ||
								!capture.rect ||
								capture.rect.width < 2 ||
								capture.rect.height < 2 ||
								(capture.mode === "element" && !capture.locked)
							}
							onClick={capture.confirm}
						>
							{t(capture.busy ? "browserCapture.busy" : "browserCapture.confirm")}
						</Button>
						<Button size="sm" variant="ghost" onClick={capture.cancel}>
							{t("browserCapture.cancel")}
						</Button>
					</div>
				)}
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
					/>
				)}
			</BrowserPanelView>
			{capture.preview && (
				<BrowserCaptureDialog capture={capture.preview} onCancel={capture.cancel} onSave={capture.add} />
			)}
		</>
	);
}
