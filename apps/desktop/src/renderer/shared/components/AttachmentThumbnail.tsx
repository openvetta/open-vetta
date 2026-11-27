import type { ReactNode } from "react";
import { Button } from "./ui/button";

export function AttachmentThumbnail({
	src,
	name,
	badge,
	removeLabel,
	onOpen,
	onRemove,
}: {
	src: string;
	name: string;
	badge: ReactNode;
	removeLabel: string;
	onOpen: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="group relative">
			<Button
				variant="ghost"
				onClick={onOpen}
				className="block h-12 w-12 overflow-hidden rounded-lg border border-border p-0 ring-1 ring-border/40"
				title={name}
			>
				<img
					src={src}
					alt={name}
					className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
				/>
			</Button>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-foreground/45 px-1 text-[9px] font-medium leading-[1.4] text-background/90"
			>
				{badge}
			</span>
			<Button
				variant="ghost"
				onClick={onRemove}
				title={removeLabel}
				aria-label={removeLabel}
				className="absolute -right-1.5 -top-1.5 size-[18px] rounded-full border border-border bg-card p-0 text-muted-foreground opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive"
			>
				<span className="icon-[solar--close-circle-linear] h-3 w-3" />
			</Button>
		</div>
	);
}
