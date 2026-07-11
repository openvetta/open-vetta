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
import { useTranslation } from "react-i18next";

export interface SettingsAiAssistDialogProps {
	contextLabel: string;
	examples: readonly string[];
	intent: string;
	open: boolean;
	placeholder: string;
	submitting: boolean;
	submitError: string | null;
	onApplyExample: (text: string) => void;
	onIntentChange: (value: string) => void;
	onOpenChange: (open: boolean) => void;
	onSubmit: () => void;
}

export function SettingsAiAssistDialog({
	contextLabel,
	examples,
	intent,
	open,
	placeholder,
	submitting,
	submitError,
	onApplyExample,
	onIntentChange,
	onOpenChange,
	onSubmit,
}: SettingsAiAssistDialogProps): JSX.Element {
	const { t } = useTranslation("settings");
	const { t: tCommon } = useTranslation("common");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
				<DialogHeader>
					<DialogTitle>{t("aiAssist.dialog.title")}</DialogTitle>
					<DialogDescription>
						{/* Avoid interpolation key `context` — reserved by i18next typed options. */}
						{t("aiAssist.dialog.description", { page: contextLabel })}
					</DialogDescription>
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

					<Textarea
						value={intent}
						onChange={(event) => onIntentChange(event.target.value)}
						placeholder={placeholder}
						disabled={submitting}
						className="min-h-[6rem] resize-none text-[13px]"
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !submitting) {
								event.preventDefault();
								onSubmit();
							}
						}}
					/>

					<p className="text-[11px] leading-relaxed text-muted-foreground">
						{t("aiAssist.dialog.approvalHint")}
					</p>

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
						{tCommon("actions.cancel")}
					</Button>
					<Button type="button" variant="primary" disabled={submitting} onClick={onSubmit}>
						{submitting ? (
							<>
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								{t("aiAssist.dialog.starting")}
							</>
						) : (
							<>
								<span className="icon-[mdi--magic-staff] h-3.5 w-3.5" />
								{t("aiAssist.dialog.start")}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
