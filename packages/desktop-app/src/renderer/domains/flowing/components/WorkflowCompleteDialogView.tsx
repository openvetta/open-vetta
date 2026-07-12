import { ThemeSurface } from "@vetta/theme-ui/appearance";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@vetta/ui";
import type { FlowingSendFileItem } from "./FlowingSendDialogView";

export interface WorkflowCompleteDialogViewLabels {
	readonly add: string;
	readonly cancel: string;
	readonly complete: string;
	readonly completing: string;
	readonly description: string;
	readonly emptyFiles: string;
	readonly files: string;
	readonly message: string;
	readonly messageOptional: string;
	readonly messagePlaceholder: string;
	readonly title: string;
}

export interface WorkflowCompleteDialogViewProps {
	readonly completing: boolean;
	readonly error: string | null;
	readonly files: readonly FlowingSendFileItem[];
	readonly labels: WorkflowCompleteDialogViewLabels;
	readonly message: string;
	readonly onAddFiles: () => void;
	readonly onComplete: () => void;
	readonly onMessageChange: (message: string) => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly onRemoveFile: (filePath: string) => void;
	readonly open: boolean;
}

export function WorkflowCompleteDialogView({
	completing,
	error,
	files,
	labels,
	message,
	onAddFiles,
	onComplete,
	onMessageChange,
	onOpenChange,
	onRemoveFile,
	open,
}: WorkflowCompleteDialogViewProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-visible sm:max-w-md">
				<ThemeSurface slot="root.workflowCompleteDialog.panel" />
				<div className="relative z-10 contents">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<span className="icon-[mdi--check-circle-outline] text-lg text-emerald-400" />
							{labels.title}
						</DialogTitle>
						<DialogDescription>{labels.description}</DialogDescription>
					</DialogHeader>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<span className="icon-[mdi--file-check-outline] text-sm" />
								{labels.files}
								{files.length > 0 && (
									<span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[0.65rem] font-semibold text-emerald-400">
										{files.length}
									</span>
								)}
							</div>
							<Button variant="ghost" size="xs" onClick={onAddFiles}>
								<span className="icon-[mdi--plus]" data-icon="inline-start" />
								{labels.add}
							</Button>
						</div>
						<div className="max-h-40 overflow-auto rounded-lg border border-border/50 bg-muted/30 text-xs">
							{files.length === 0 ? (
								<button
									type="button"
									onClick={onAddFiles}
									className="flex w-full items-center justify-center gap-2 p-4 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
								>
									<span className="icon-[mdi--cloud-upload-outline] text-lg" />
									{labels.emptyFiles}
								</button>
							) : (
								<div className="divide-y divide-border/30">
									{files.map((file) => (
										<div key={file.path} className="group flex min-w-0 items-center gap-2 px-2.5 py-1.5">
											<span className="icon-[mdi--file-outline] shrink-0 text-sm text-muted-foreground/50" />
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">{file.label}</div>
											</div>
											<button
												type="button"
												className="shrink-0 rounded-md p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
												onClick={() => onRemoveFile(file.path)}
											>
												<span className="icon-[mdi--close] text-sm" />
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<span className="icon-[mdi--message-text-outline] text-sm" />
							{labels.message}
							<span className="font-normal text-muted-foreground/50">{labels.messageOptional}</span>
						</div>
						<textarea
							value={message}
							onChange={(e) => onMessageChange(e.target.value)}
							placeholder={labels.messagePlaceholder}
							className="flex field-sizing-content min-h-16 w-full min-h-[4.5rem] resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
						/>
					</div>

					{error && (
						<div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
							<span className="icon-[mdi--alert-circle-outline] shrink-0 text-sm" />
							{error}
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={completing}>
							{labels.cancel}
						</Button>
						<Button onClick={onComplete} disabled={completing}>
							{completing ? (
								<>
									<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
									{labels.completing}
								</>
							) : (
								<>
									<span className="icon-[mdi--check] text-xs" data-icon="inline-start" />
									{labels.complete}
								</>
							)}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
