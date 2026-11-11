import { Button } from "@vetta-org/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@vetta-org/ui/dialog";
import { Input } from "@vetta-org/ui/input";
import { useTranslation } from "react-i18next";
import { useGitCloneModel } from "./useGitCloneModel";

interface GitCloneDialogProps {
	onCloned: (path: string) => void;
	onCancel: () => void;
}

/** 输入仓库地址、选存放目录，克隆完成后由调用方登记成项目。 */
export function GitCloneDialog({ onCloned, onCancel }: GitCloneDialogProps): JSX.Element {
	const { t } = useTranslation("project");
	const model = useGitCloneModel(onCloned);

	return (
		<Dialog open onOpenChange={(open) => !open && onCancel()}>
			<DialogContent className="max-w-[min(30rem,calc(100%-2rem))]" onInteractOutside={(e) => e.preventDefault()}>
				<DialogHeader className="gap-1.5">
					<DialogTitle>{t("gitCloneDialog.title")}</DialogTitle>
					<DialogDescription>{t("gitCloneDialog.description")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label htmlFor="git-clone-url" className="text-[12px] text-muted-foreground">
							{t("gitCloneDialog.urlLabel")}
						</label>
						<Input
							id="git-clone-url"
							autoFocus
							value={model.url}
							disabled={model.cloning}
							aria-invalid={model.error ? true : undefined}
							placeholder={t("gitCloneDialog.urlPlaceholder")}
							className="h-9"
							onChange={(e) => model.setUrl(e.target.value)}
							onKeyDown={(e) => {
								// 输入法组合中的 Enter 是选词，不是提交。
								if (e.key === "Enter" && !e.nativeEvent.isComposing) void model.submit();
							}}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<span className="text-[12px] text-muted-foreground">{t("gitCloneDialog.parentLabel")}</span>
						<div className="flex items-center gap-2">
							<span
								className="min-w-0 flex-1 truncate rounded-md border border-border px-3 py-2 text-[12px] text-foreground"
								title={model.parentDir}
							>
								{model.parentDir || "…"}
							</span>
							<Button variant="outline" disabled={model.cloning} onClick={() => void model.chooseParentDir()}>
								{t("gitCloneDialog.choose")}
							</Button>
						</div>
					</div>
					{model.error && (
						<p role="alert" className="whitespace-pre-wrap break-words text-[12px] leading-snug text-destructive">
							{model.error}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={model.cloning ? model.cancel : onCancel}>
						{model.cloning ? t("gitCloneDialog.stop") : t("gitCloneDialog.cancel")}
					</Button>
					<Button variant="primary" disabled={!model.canSubmit} onClick={() => void model.submit()}>
						{model.cloning ? t("gitCloneDialog.cloning") : t("gitCloneDialog.clone")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
