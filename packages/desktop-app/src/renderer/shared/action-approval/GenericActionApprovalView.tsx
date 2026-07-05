import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

export interface GenericActionApprovalViewLabels {
	readonly rejecting: string;
	readonly responding: string;
}

export interface GenericActionApprovalViewProps {
	readonly confirmLabel: string;
	readonly countdown: string;
	readonly error: string | null;
	readonly inputJson: string;
	readonly labels: GenericActionApprovalViewLabels;
	readonly onApprove: () => void;
	readonly onReject: () => void;
	readonly permissionLabel: string;
	readonly responding: boolean;
	readonly summary: string;
	readonly title: string;
}

export function GenericActionApprovalView({
	confirmLabel,
	countdown,
	error,
	inputJson,
	labels,
	onApprove,
	onReject,
	permissionLabel,
	responding,
	summary,
	title,
}: GenericActionApprovalViewProps): JSX.Element {
	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-visible sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<ThemeSurface slot="root.genericActionApproval.panel" />
				<div className="relative z-10 grid min-h-0 gap-4">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{summary}</DialogDescription>
					</DialogHeader>
					<div className="min-h-0 overflow-y-auto">
						<pre className="whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
							{inputJson}
						</pre>
						<div className="mt-3 text-[11px] text-muted-foreground">{permissionLabel}</div>
						{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button variant="outline" size="sm" disabled={responding} onClick={onReject}>
							{labels.rejecting}（{countdown}）
						</Button>
						<Button size="sm" disabled={responding} onClick={onApprove}>
							{responding ? labels.responding : confirmLabel}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
