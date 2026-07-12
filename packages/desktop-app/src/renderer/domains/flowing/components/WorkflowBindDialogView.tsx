import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import type { WorkflowTemplate } from "@shared/lib/api";

export interface WorkflowBindDialogViewProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	loading: boolean;
	workflows: readonly WorkflowTemplate[];
	selectedId: number | null;
	onSelect: (id: number) => void;
	binding: boolean;
	error: string | null;
	onBind: () => void;
}

/**
 * Host Dialog primitive: props-only view held until @vetta/ui Dialog lands.
 */
export function WorkflowBindDialogView({
	open,
	onOpenChange,
	loading,
	workflows,
	selectedId,
	onSelect,
	binding,
	error,
	onBind,
}: WorkflowBindDialogViewProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="icon-[mdi--sitemap-outline] text-lg text-primary" />
						绑定工作流
					</DialogTitle>
					<DialogDescription>选择一个工作流模板，绑定到当前项目</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex h-40 items-center justify-center">
						<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
					</div>
				) : workflows.length === 0 ? (
					<div className="flex h-40 items-center justify-center text-xs text-muted-foreground/50">
						暂无可用工作流
					</div>
				) : (
					<div className="max-h-64 space-y-2 overflow-y-auto">
						{workflows.map((wf) => {
							const isSelected = selectedId === wf.id;
							return (
								<button
									key={wf.id}
									type="button"
									onClick={() => onSelect(wf.id)}
									className={`w-full rounded-lg border p-3 text-left transition-colors ${
										isSelected
											? "border-primary bg-primary/5"
											: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
									}`}
								>
									<div className="mb-1 flex items-center gap-2">
										<span className="text-[13px] font-medium text-foreground">{wf.name}</span>
										<span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
											{wf.stages.length} 个阶段
										</span>
									</div>
									{wf.description && (
										<p className="mb-2 text-[11px] text-muted-foreground/70">{wf.description}</p>
									)}
									<div className="flex flex-wrap gap-1">
										{wf.stages.map((stage, i) => (
											<span
												key={i}
												className="rounded-md bg-accent/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
											>
												{stage.name}
											</span>
										))}
									</div>
								</button>
							);
						})}
					</div>
				)}

				{error && (
					<div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
						<span className="icon-[mdi--alert-circle-outline] shrink-0 text-sm" />
						{error}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={binding}>
						取消
					</Button>
					<Button onClick={onBind} disabled={binding || selectedId === null}>
						{binding ? (
							<>
								<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
								绑定中
							</>
						) : (
							<>
								<span className="icon-[mdi--link-variant] text-xs" data-icon="inline-start" />
								绑定
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
