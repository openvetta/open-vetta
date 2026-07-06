import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useCodeClipboard } from "@shared/hooks/useCodeClipboard";

interface CodeBlockCopyButtonProps {
	children: ReactNode;
	language?: string;
	code: string;
}

export function CodeBlockCopyButton({ children, code }: CodeBlockCopyButtonProps): JSX.Element {
	const { copied, copy } = useCodeClipboard(code);

	function stopMessageDrag(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>): void {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleCopy(event: MouseEvent<HTMLButtonElement>): void {
		stopMessageDrag(event);
		void copy();
	}

	return (
		<div className="group/code-block relative">
			<button
				type="button"
				onPointerDown={stopMessageDrag}
				onMouseDown={stopMessageDrag}
				onClick={handleCopy}
				aria-label={copied ? "Copied" : "Copy code"}
				title={copied ? "Copied" : "Copy code"}
				className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#30363d] bg-[#161b22]/95 text-[#c9d1d9] opacity-0 shadow-sm transition-opacity hover:bg-[#21262d] hover:text-white focus-visible:opacity-100 group-hover/code-block:opacity-100"
			>
				<span className={copied ? "icon-[mdi--check] h-4 w-4" : "icon-[solar--copy-linear] h-4 w-4"} />
			</button>
			{children}
		</div>
	);
}
