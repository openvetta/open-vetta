import { FilesPanel } from "@domains/file-explorer/components/FilesPanel";
import { FilePreviewView } from "@domains/file-preview/components/FilePreviewView";
import { Button } from "@shared/components/ui/button";
import { FileTabContentView } from "@vetta-org/theme-ui/activity";
import { useTranslation } from "react-i18next";
import { useFileTabContentModel } from "../../hooks/useFileTabContentModel";

interface FileTabContentProps {
	cwd: string | null;
}

export function FileTabContent({ cwd }: FileTabContentProps): JSX.Element {
	const model = useFileTabContentModel();
	const { t } = useTranslation("chat");

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
			{model.compact && (
				<div className="flex shrink-0 gap-1 border-b border-border/50 px-2 py-1">
					<Button
						type="button"
						variant={model.showTree ? "secondary" : "ghost"}
						size="sm"
						aria-pressed={model.showTree}
						onClick={model.showCompactTree}
					>
						{t("fileExplorer.fileList")}
					</Button>
					<Button
						type="button"
						variant={model.showPreview ? "secondary" : "ghost"}
						size="sm"
						aria-pressed={model.showPreview}
						onClick={model.showCompactPreview}
					>
						{t("fileEditor.preview")}
					</Button>
				</div>
			)}
			<FileTabContentView
				showTree={model.showTree}
				showPreview={model.showPreview}
				treeWidth={model.treeWidth}
				onTreeResize={model.onTreeResize}
				tree={<FilesPanel cwd={cwd} />}
				preview={
					model.showPreview && model.previewCtx ? (
						model.previewMounted ? (
							<FilePreviewView
								ctx={model.previewCtx}
								onPrev={model.goPrev}
								onNext={model.goNext}
								onClose={model.closePreview}
								canPrev={model.canPrev}
								canNext={model.canNext}
								enableKeyboard
								onToggleSidebar={model.toggleTree}
								sidebarCollapsed={model.treeCollapsed}
							/>
						) : (
							<div className="flex min-h-0 flex-1" />
						)
					) : null
				}
			/>
		</div>
	);
}
