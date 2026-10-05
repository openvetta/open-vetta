import { Button } from "@vetta-org/ui";
import type { JSX } from "react";

export interface FilePathCopyAction {
	readonly label: string;
	readonly title: string;
	readonly onCopy: () => void;
}

/** A host-owned clipboard command; the view never resolves paths or writes the clipboard. */
export function FilePathCopyButton({ label, title, onCopy }: FilePathCopyAction): JSX.Element {
	return (
		<Button
			type="button"
			variant="ghost"
			title={title}
			aria-label={title}
			onClick={(event) => {
				event.stopPropagation();
				onCopy();
			}}
			className="pointer-events-auto h-7 shrink-0 gap-1.5 px-2 text-[11px] text-muted-foreground"
		>
			<span aria-hidden="true" className="icon-[solar--copy-linear] h-3.5 w-3.5" />
			<span className="hidden @[28rem]:inline">{label}</span>
		</Button>
	);
}
