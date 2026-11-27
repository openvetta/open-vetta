import { BrowserPanelView } from "@vetta-org/theme-ui/activity/BrowserPanelView";
import { useBrowserPanelModel } from "../hooks/useBrowserPanelModel";
import { BrowserSelectionView } from "@vetta-org/theme-ui/activity";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@shared/components/ui/dialog";
import { Textarea } from "@shared/components/ui/textarea";
import { toVettaFileUrl } from "@shared/lib/utils";
import { useBrowserCapture } from "../hooks/useBrowserCapture";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { activeInputDraftKeyAtom } from "@shared/store/atoms";

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
	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-1">
				{capture.mode ? (
					<>
						<span className="text-xs text-muted-foreground">{t("browserCapture.hint")}</span>
						{capture.mode === "element" ? (
							<>
								<Button
									variant="ghost"
									size="sm"
									disabled={
										!capture.locked || capture.busy || capture.level >= (capture.inspection?.elements.length ?? 0) - 1
									}
									onClick={capture.expand}
								>
									{t("browserCapture.expand")}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={!capture.locked || capture.busy || capture.level === 0}
									onClick={capture.shrink}
								>
									{t("browserCapture.shrink")}
								</Button>
							</>
						) : null}
						<Button
							size="sm"
							disabled={
								capture.busy ||
								!capture.rect ||
								capture.rect.width < 2 ||
								capture.rect.height < 2 ||
								(capture.mode === "element" && !capture.locked)
							}
							onClick={() => void capture.confirm()}
						>
							<span className="grid">
								<span aria-hidden="true" className="invisible col-start-1 row-start-1">
									{t("browserCapture.confirm")}
								</span>
								<span aria-hidden="true" className="invisible col-start-1 row-start-1">
									{t("browserCapture.busy")}
								</span>
								<span className="col-start-1 row-start-1">
									{t(capture.busy ? "browserCapture.busy" : "browserCapture.confirm")}
								</span>
							</span>
						</Button>
						<Button variant="ghost" size="sm" onClick={capture.cancel}>
							{t("browserCapture.cancel")}
						</Button>
					</>
				) : (
					<>
						<Button
							variant="ghost"
							size="sm"
							disabled={!draftKey || !model.hasPage || model.loading || model.failed}
							onClick={capture.start}
						>
							{t("browserCapture.select")}
						</Button>
					</>
				)}
			</div>
			<BrowserPanelView {...model}>
				{capture.mode ? (
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
				) : null}
			</BrowserPanelView>
			<Dialog
				open={capture.preview !== null}
				onOpenChange={(open) => {
					if (!open) capture.cancel();
				}}
			>
				<DialogContent className="sm:max-w-3xl" showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>{t("browserCapture.preview")}</DialogTitle>
						<DialogDescription>{t("browserCapture.note")}</DialogDescription>
					</DialogHeader>
					{capture.preview ? (
						<div className="space-y-3">
							<img
								src={toVettaFileUrl(capture.preview.imagePath)}
								alt={t("browserCapture.preview")}
								className="max-h-[55vh] w-full rounded-lg border border-border object-contain"
							/>
							<Textarea
								aria-label={t("browserCapture.note")}
								placeholder={t("browserCapture.note")}
								value={capture.preview.note}
								maxLength={10000}
								onChange={(event) => capture.setNote(event.target.value)}
							/>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="ghost" onClick={capture.cancel}>
							{t("browserCapture.cancel")}
						</Button>
						<Button onClick={capture.add}>{t("browserCapture.add")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
