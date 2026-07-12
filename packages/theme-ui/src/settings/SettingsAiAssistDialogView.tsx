import type { JSX } from "react";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	cn,
} from "@vetta/ui";

export interface SettingsAiAssistDialogViewLabels {
	readonly title: string;
	readonly description: string;
	readonly approvalHint: string;
	readonly cancel: string;
	readonly start: string;
	readonly starting: string;
}

export interface SettingsAiAssistDialogViewProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly examples: readonly string[];
	readonly intent: string;
	readonly placeholder: string;
	readonly submitting: boolean;
	readonly submitError: string | null;
	readonly onApplyExample: (text: string) => void;
	readonly onIntentChange: (value: string) => void;
	readonly onSubmit: () => void;
	readonly labels: SettingsAiAssistDialogViewLabels;
}

export function SettingsAiAssistDialogView({
	open,
	onOpenChange,
	examples,
	intent,
	placeholder,
	submitting,
	submitError,
	onApplyExample,
	onIntentChange,
	onSubmit,
	labels,
}: SettingsAiAssistDialogViewProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
				<DialogHeader>
					<DialogTitle>{labels.title}</DialogTitle>
					<DialogDescription>{labels.description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					{examples.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{examples.map((example) => (
								<button
									key={example}
									type="button"
									disabled={submitting}
									onClick={() => onApplyExample(example)}
									className={cn(
										"rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground",
										"transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
										"disabled:pointer-events-none disabled:opacity-50",
									)}
								>
									{example}
								</button>
							))}
						</div>
					)}

					<textarea
						value={intent}
						onChange={(event) => onIntentChange(event.target.value)}
						placeholder={placeholder}
						disabled={submitting}
						className="flex field-sizing-content min-h-16 w-full min-h-[6rem] resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !submitting) {
								event.preventDefault();
								onSubmit();
							}
						}}
					/>

					<p className="text-[11px] leading-relaxed text-muted-foreground">{labels.approvalHint}</p>

					{submitError && (
						<div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
							<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{submitError}</span>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={submitting}
						onClick={() => onOpenChange(false)}
					>
						{labels.cancel}
					</Button>
					<Button type="button" variant="primary" disabled={submitting} onClick={onSubmit}>
						{submitting ? (
							<>
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								{labels.starting}
							</>
						) : (
							<>
								<span className="icon-[mdi--magic-staff] h-3.5 w-3.5" />
								{labels.start}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
