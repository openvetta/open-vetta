import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

export interface NavigationOpenApprovalField {
	readonly label: string;
	readonly value: string;
}

export interface NavigationOpenApprovalViewLabels {
	readonly confirm: string;
	readonly permission: string;
	readonly reject: string;
	readonly responding: string;
	readonly title: string;
}

export interface NavigationOpenApprovalViewProps {
	readonly countdown: string;
	readonly error: string | null;
	readonly fallbackJson: string | null;
	readonly fields: readonly NavigationOpenApprovalField[];
	readonly labels: NavigationOpenApprovalViewLabels;
	readonly onApprove: () => void;
	readonly onReject: () => void;
	readonly permission: string;
	readonly responding: boolean;
	readonly summary: string;
}

export function NavigationOpenApprovalView({
	countdown,
	error,
	fallbackJson,
	fields,
	labels,
	onApprove,
	onReject,
	permission,
	responding,
	summary,
}: NavigationOpenApprovalViewProps): JSX.Element {
	return (
		<Dialog open>
			<DialogContent
				className="relative max-h-[90vh] overflow-hidden sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<ThemeSurface slot="root.approval.navigationOpen.panel" />
				<div className="relative z-10 contents">
					<DialogHeader>
						<DialogTitle>{labels.title}</DialogTitle>
						<DialogDescription>{summary}</DialogDescription>
					</DialogHeader>
					<div className="min-h-0 overflow-y-auto">
						{fields.length > 0 && (
							<div className="space-y-1.5">
								{fields.map((field) => (
									<div
										key={field.label}
										className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5"
									>
										<span className="text-[11px] text-muted-foreground">{field.label}</span>
										<span className="text-[11px] font-medium text-foreground">{field.value}</span>
									</div>
								))}
							</div>
						)}
						{fallbackJson && (
							<pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-foreground">
								{fallbackJson}
							</pre>
						)}
						<div className="mt-2.5 text-[10px] text-muted-foreground">
							{labels.permission}{permission}
						</div>
						{error && <div className="mt-1.5 text-[10px] text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button variant="outline" size="sm" disabled={responding} onClick={onReject}>
							{labels.reject}（{countdown}）
						</Button>
						<Button size="sm" disabled={responding} onClick={onApprove}>
							{responding ? labels.responding : labels.confirm}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
