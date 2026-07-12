import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import type { KnowledgeBaseSwitcherModel } from "../hooks/useKnowledgeBaseSwitcherModel";
import { KnowledgeRenameDialog } from "./KnowledgeRenameDialog";

export function KnowledgeBaseSwitcherView(model: KnowledgeBaseSwitcherModel): JSX.Element {
	return (
		<>
			<Popover open={model.open} onOpenChange={model.onOpenChange}>
				<PopoverTrigger asChild>
					<button type="button" className="group flex max-w-full items-center gap-2 text-left">
						<h1 className="truncate text-[24px] font-bold tracking-tight text-foreground">
							{model.activeName}
						</h1>
						<span
							className={cn(
								"icon-[mdi--chevron-down] h-5 w-5 shrink-0 text-muted-foreground transition-transform",
								model.open && "rotate-180",
							)}
						/>
						{model.basesCount > 1 && (
							<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
								{model.basesCount}
							</span>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-80 gap-1 p-1.5">
					<div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
						{model.labels.switchLabel}
					</div>
					{model.items.map((item) => (
						<Button
							key={item.id}
							type="button"
							variant="ghost"
							onClick={() => model.onSelect(item.id)}
							className={cn(
								"h-auto w-full justify-start gap-2.5 px-2 py-2 text-left",
								item.active ? "bg-primary/10" : "hover:bg-accent",
							)}
						>
							<span
								className={cn(
									"h-4 w-4 shrink-0",
									item.isDefault ? "icon-[mdi--account-circle-outline]" : "icon-[mdi--book-outline]",
									item.active ? "text-primary" : "text-muted-foreground",
								)}
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12px] font-medium text-foreground">{item.name}</p>
								<p className="mt-0.5 text-[10px] text-muted-foreground/55">{item.fileCountLabel}</p>
							</div>
							{item.active && <span className="icon-[mdi--check] h-4 w-4 text-primary" />}
						</Button>
					))}

					<div className="my-1 h-px bg-border/60" />

					{model.showManageCurrent && (
						<>
							<Button
								type="button"
								variant="ghost"
								onClick={model.onStartRename}
								className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-foreground"
							>
								<span className="icon-[mdi--rename-outline] h-4 w-4 text-muted-foreground" />
								{model.labels.renameCurrent}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={model.onConfirmDelete}
								className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-red-600 hover:bg-red-500/10 hover:text-red-600"
							>
								<span className="icon-[mdi--trash-can-outline] h-4 w-4" />
								{model.labels.deleteCurrent}
							</Button>
							<div className="my-1 h-px bg-border/60" />
						</>
					)}

					<Button
						type="button"
						variant="ghost"
						onClick={model.onViewAll}
						className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-foreground"
					>
						<span className="icon-[mdi--view-grid-outline] h-4 w-4 text-muted-foreground" />
						<span className="flex-1 text-left">{model.labels.viewAll}</span>
						<span className="text-[10px] tabular-nums text-muted-foreground/45">{model.basesCount}</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={model.onCreate}
						className="h-8 w-full justify-start gap-2 px-2 text-[12px] font-medium text-primary hover:bg-primary/10 hover:text-primary"
					>
						<span className="icon-[mdi--plus] h-4 w-4" />
						{model.labels.createBase}
					</Button>
				</PopoverContent>
			</Popover>

			{model.renaming && (
				<KnowledgeRenameDialog
					title={model.labels.renameBaseTitle}
					initialName={model.activeName}
					onClose={() => model.setRenaming(false)}
					onSubmit={model.onRenameSubmit}
				/>
			)}
		</>
	);
}
