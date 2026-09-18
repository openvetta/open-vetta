import type { JSX } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@vetta-org/ui";
import { useTranslation } from "react-i18next";

export interface GrokSubscriptionDialogState {
	readonly open: boolean;
	readonly userCode: string;
	readonly url: string;
	readonly error: string | null;
}

export function GrokSubscriptionDialog({
	state,
	onCancel,
	onOpenPage,
	onCopyCode,
}: {
	state: GrokSubscriptionDialogState;
	onCancel: () => void;
	onOpenPage: () => void;
	onCopyCode: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<Dialog
			open={state.open}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>{t("grokSubscriptionDialogTitle")}</DialogTitle>
					<DialogDescription>
						{state.userCode ? t("grokSubscriptionEnterCode") : t("grokSubscriptionWaiting")}
					</DialogDescription>
				</DialogHeader>
				{state.userCode ? (
					<div className="flex flex-col items-center gap-3 py-2">
						<div className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-[20px] font-semibold tracking-[0.2em] text-foreground">
							{state.userCode}
						</div>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" onClick={onCopyCode}>
								{t("grokSubscriptionCopyCode")}
							</Button>
							<Button variant="outline" size="sm" onClick={onOpenPage}>
								{t("grokSubscriptionOpenPage")}
							</Button>
						</div>
						<p className="text-[12px] text-muted-foreground">{t("grokSubscriptionWaitingAuth")}</p>
					</div>
				) : (
					<div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
						<span className="icon-[solar--refresh-linear] h-4 w-4 animate-spin" />
						{t("grokSubscriptionWaiting")}
					</div>
				)}
				{state.error ? <p className="text-[12px] text-destructive">{state.error}</p> : null}
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={onCancel}>
						{t("grokSubscriptionCancel")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
