import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Textarea } from "@shared/components/ui/textarea";
import { cn } from "@shared/lib/utils";
import type { ColleagueInfo } from "@shared/lib/api";
import { ThemeSurface } from "@vetta/theme-ui/appearance";

export interface FlowingSendFileItem {
	readonly label: string;
	readonly path: string;
}

export interface FlowingSendDialogViewLabels {
	readonly add: string;
	readonly cancel: string;
	readonly emptyFiles: string;
	readonly emptyMembers: string;
	readonly emptyNextStageMembers: string;
	readonly files: string;
	readonly message: string;
	readonly messageOptional: string;
	readonly messagePlaceholder: string;
	readonly nextStageMembers: string;
	readonly receivers: string;
	readonly selectedSummary: string;
	readonly send: string;
	readonly sending: string;
	readonly title: string;
}

export interface FlowingSendDialogViewProps {
	readonly canSend: boolean;
	readonly colleagues: readonly ColleagueInfo[];
	readonly description: string;
	readonly displayError: string | null;
	readonly files: readonly FlowingSendFileItem[];
	readonly isWorkflowBound: boolean;
	readonly labels: FlowingSendDialogViewLabels;
	readonly message: string;
	readonly onAddFiles: () => void;
	readonly onMessageChange: (message: string) => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly onRemoveFile: (filePath: string) => void;
	readonly onSend: () => void;
	readonly onToggleReceiver: (id: number) => void;
	readonly open: boolean;
	readonly selectedReceiverIds: readonly number[];
	readonly sending: boolean;
}

export function FlowingSendDialogView({
	canSend,
	colleagues,
	description,
	displayError,
	files,
	isWorkflowBound,
	labels,
	message,
	onAddFiles,
	onMessageChange,
	onOpenChange,
	onRemoveFile,
	onSend,
	onToggleReceiver,
	open,
	selectedReceiverIds,
	sending,
}: FlowingSendDialogViewProps): JSX.Element {
	const selectedReceivers = new Set(selectedReceiverIds);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="relative overflow-hidden sm:max-w-md">
				<ThemeSurface slot="root.flowingSendDialog.panel" />
				<div className="relative z-10 contents">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<span className="icon-[mdi--send-variant-outline] text-lg text-primary" />
							{labels.title}
						</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<span className="icon-[mdi--file-document-outline] text-sm" />
								{labels.files}
								{files.length > 0 && (
									<span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.65rem] font-semibold text-primary">
										{files.length}
									</span>
								)}
							</div>
							<Button variant="ghost" size="xs" onClick={onAddFiles}>
								<span className="icon-[mdi--plus]" data-icon="inline-start" />
								{labels.add}
							</Button>
						</div>
						<div className="max-h-32 overflow-auto rounded-lg border border-border/50 bg-muted/30 text-xs">
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
								<span className="icon-[mdi--account-group-outline] text-sm" />
							{isWorkflowBound ? labels.nextStageMembers : labels.receivers}
							{selectedReceiverIds.length > 0 && (
								<span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.65rem] font-semibold text-primary">
									{selectedReceiverIds.length}
								</span>
							)}
						</div>
						<div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-muted/30">
							{colleagues.length === 0 ? (
								<div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground/50">
									<span className="icon-[mdi--account-off-outline] text-base" />
									{isWorkflowBound ? labels.emptyNextStageMembers : labels.emptyMembers}
								</div>
							) : (
								<div className="p-1">
									{colleagues.map((colleague) => {
										const isSelected = selectedReceivers.has(colleague.id);
										return (
											<label
												key={colleague.id}
												className={cn(
													"flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors",
													isSelected
														? "bg-primary/10 text-foreground"
														: "text-muted-foreground hover:bg-muted",
												)}
											>
												<input
													type="checkbox"
													checked={isSelected}
													onChange={() => onToggleReceiver(colleague.id)}
													className="sr-only"
												/>
												<span
													className={cn(
														"flex size-4 shrink-0 items-center justify-center rounded border text-[0.6rem] transition-colors",
														isSelected
															? "border-primary bg-primary text-primary-foreground"
															: "border-border bg-background",
													)}
												>
													{isSelected && <span className="icon-[mdi--check] text-xs" />}
												</span>
												<span className="flex items-center gap-1.5 text-xs">
													<span
														className={cn(
															"flex size-5 items-center justify-center rounded-full text-[0.6rem] font-medium",
															isSelected
																? "bg-primary/15 text-primary"
																: "bg-muted text-muted-foreground",
														)}
													>
														{colleague.username.charAt(0).toUpperCase()}
													</span>
													{colleague.username}
												</span>
											</label>
										);
									})}
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
						<Textarea
							value={message}
							onChange={(e) => onMessageChange(e.target.value)}
							placeholder={labels.messagePlaceholder}
							className="min-h-[4.5rem] resize-none text-xs"
						/>
					</div>

					{displayError && (
						<div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
							<span className="icon-[mdi--alert-circle-outline] shrink-0 text-sm" />
							{displayError}
						</div>
					)}

					<DialogFooter>
						{canSend && (
							<div className="mr-auto hidden items-center text-xs text-muted-foreground sm:flex">
								{labels.selectedSummary}
							</div>
						)}
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
							{labels.cancel}
						</Button>
						<Button onClick={onSend} disabled={sending || !canSend}>
							{sending ? (
								<>
									<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
									{labels.sending}
								</>
							) : (
								<>
									<span className="icon-[mdi--send] text-xs" data-icon="inline-start" />
									{labels.send}
								</>
							)}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
