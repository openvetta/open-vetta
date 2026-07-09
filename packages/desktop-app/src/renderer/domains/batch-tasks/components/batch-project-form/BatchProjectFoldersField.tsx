import { Button } from "@shared/components/ui/button";
import { Textarea } from "@shared/components/ui/textarea";
import { useTranslation } from "react-i18next";

export function BatchProjectFoldersField({
	emptyText,
	folderInputMode,
	folderText,
	folders,
	label,
	onFolderTextChange,
	onInputModeChange,
	onRemoveFolder,
	onSelectFolders,
}: {
	emptyText: string;
	folderInputMode: "picker" | "textarea";
	folderText: string;
	folders: string[];
	label: string;
	onFolderTextChange: (value: string) => void;
	onInputModeChange: (mode: "picker" | "textarea") => void;
	onRemoveFolder: (folder: string) => void;
	onSelectFolders: () => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<div>
			<div className="mb-2 flex items-center justify-between gap-3">
				<p className="text-sm font-medium text-foreground">{label}</p>
				<div className="inline-flex rounded-lg border border-border p-0.5">
					<button
						type="button"
						onClick={() => onInputModeChange("picker")}
						className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
							folderInputMode === "picker" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t("form.folderModePicker")}
					</button>
					<button
						type="button"
						onClick={() => onInputModeChange("textarea")}
						className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
							folderInputMode === "textarea" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t("form.folderModeText")}
					</button>
				</div>
			</div>
			{folderInputMode === "picker" ? (
				<Button type="button" variant="outline" size="sm" onClick={onSelectFolders}>
					{t("form.selectFolder")}
				</Button>
			) : (
				<>
					<Textarea
						value={folderText}
						onChange={(event) => onFolderTextChange(event.target.value)}
						className="min-h-[96px] text-sm"
						placeholder={"/path/to/project-a\n/path/to/project-b"}
					/>
					<p className="mt-2 text-xs text-muted-foreground/60">{t("form.folderTextHint")}</p>
				</>
			)}
			{folders.length > 0 ? (
				<div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
					{folders.map((folder) => (
						<div key={folder} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50">
							<span className="truncate text-sm text-foreground">{folder}</span>
							<button
								type="button"
								onClick={() => onRemoveFolder(folder)}
								className="ml-2 shrink-0 text-muted-foreground/50 hover:text-destructive"
							>
								<span className="icon-[solar--close-circle-linear] text-[14px]" />
							</button>
						</div>
					))}
				</div>
			) : (
				<p className="mt-3 text-xs text-muted-foreground/50">{emptyText}</p>
			)}
		</div>
	);
}
