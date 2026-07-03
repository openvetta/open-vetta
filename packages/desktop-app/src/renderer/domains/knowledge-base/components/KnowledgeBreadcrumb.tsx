import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";

interface KnowledgeBreadcrumbProps {
	/** 根目录（知识库）显示名。 */
	baseName: string;
	/** 当前所在的目录层级，从根往下。 */
	path: string[];
	/** 跳转到指定层级；-1 表示回到根目录，否则为 path 的下标。 */
	onNavigate: (index: number) => void;
}

// 超过该层级时，中间层折叠为一个省略号 item，只保留末尾若干层。
const MAX_VISIBLE_TAIL = 2;

export function KnowledgeBreadcrumb({
	baseName,
	path,
	onNavigate,
}: KnowledgeBreadcrumbProps): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);

	const collapsed = path.length > MAX_VISIBLE_TAIL + 1;
	const hiddenCount = collapsed ? path.length - MAX_VISIBLE_TAIL : 0;
	const hidden = collapsed ? path.slice(0, hiddenCount) : [];
	const tail = collapsed ? path.slice(hiddenCount) : path;

	const chevron = <span className="icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />;

	return (
		<div className="flex shrink-0 items-center gap-1 py-1.5 text-[12px]">
			<button
				type="button"
				onClick={() => onNavigate(-1)}
				className="flex max-w-[160px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent/60"
			>
				<span className="icon-[mdi--folder-home-outline] h-3.5 w-3.5 shrink-0" />
				<span className="truncate">{baseName}</span>
			</button>

			{collapsed ? (
				<span className="flex items-center gap-1">
					{chevron}
					<Popover open={menuOpen} onOpenChange={setMenuOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex shrink-0 items-center rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent/60"
							>
								<span className="icon-[mdi--dots-horizontal] h-3.5 w-3.5" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-52 gap-0.5 p-1">
							{hidden.map((segment, index) => (
								<button
									key={`${segment}-${index}`}
									type="button"
									onClick={() => {
										setMenuOpen(false);
										onNavigate(index);
									}}
									className="flex h-8 w-full items-center gap-1.5 rounded px-2.5 text-left text-[12px] text-foreground transition-colors hover:bg-accent/60"
								>
									<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{segment}</span>
								</button>
							))}
						</PopoverContent>
					</Popover>
				</span>
			) : null}

			{tail.map((segment, index) => {
				const realIndex = collapsed ? hiddenCount + index : index;
				const isLast = realIndex === path.length - 1;
				return (
					<span key={`${segment}-${realIndex}`} className="flex items-center gap-1">
						{chevron}
						<button
							type="button"
							onClick={() => onNavigate(realIndex)}
							className={cn(
								"max-w-[200px] truncate rounded px-1.5 py-0.5 transition-colors hover:bg-accent/60",
								isLast ? "text-foreground" : "text-muted-foreground",
							)}
							title={segment}
						>
							{segment}
						</button>
					</span>
				);
			})}
		</div>
	);
}
