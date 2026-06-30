import { useTranslation } from "react-i18next";
import { getColoredFileIcon } from "@domains/file-explorer/components/fileIcons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
import type { UnprocessedFile } from "../lib/knowledge-base";

interface KnowledgePendingFilesDialogProps {
	/** 当前库显示名，根目录文件的目录标签回退到它。 */
	baseName: string;
	files: UnprocessedFile[];
	/** 点击某项：跳到其所在目录并高亮。 */
	onPick: (fileId: string) => void;
	onClose: () => void;
}

/** 待加工（未加工）文件平铺清单：图标 + 文件名 + 灰字相对目录；点击跳转到对应目录。 */
export function KnowledgePendingFilesDialog({
	baseName,
	files,
	onPick,
	onClose,
}: KnowledgePendingFilesDialogProps): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>{t("kbPendingTitle", { n: files.length })}</DialogTitle>
				</DialogHeader>

				{files.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
						<span className="icon-[mdi--check-circle-outline] h-9 w-9 text-primary/70" />
						<p className="text-[13px] text-muted-foreground">{t("kbPendingEmpty")}</p>
					</div>
				) : (
					<div className="-mx-1 max-h-[60vh] overflow-y-auto px-1 py-1">
						<div className="flex flex-col">
							{files.map((file) => (
								<button
									key={file.id}
									type="button"
									onClick={() => onPick(file.id)}
									className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.05]"
								>
									<span
										className={`${getColoredFileIcon(file.name, false)} h-5 w-5 shrink-0 opacity-40 grayscale`}
									/>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-[13px] leading-5 text-foreground/90">{file.name}</span>
										<span className="truncate text-[11px] leading-4 text-muted-foreground/55">
											{file.dir || baseName}
										</span>
									</span>
									<span className="icon-[mdi--arrow-top-right] h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70" />
								</button>
							))}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
