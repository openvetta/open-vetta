import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";

interface KnowledgeSourcePickerProps {
	onPickFiles: () => void;
	onPickFolders: () => void;
	size?: "sm";
}

export function KnowledgeSourcePicker({
	onPickFiles,
	onPickFolders,
	size,
}: KnowledgeSourcePickerProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const runAndClose = (action: () => void) => {
		setOpen(false);
		action();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size={size}>
					<span className="icon-[mdi--file-plus-outline] h-4 w-4" />
					添加资料
					<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-44 gap-1 p-1">
				<button
					type="button"
					onClick={() => runAndClose(onPickFiles)}
					className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12px] text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--file-multiple-outline] h-4 w-4 text-muted-foreground" />
					选择文件
				</button>
				<button
					type="button"
					onClick={() => runAndClose(onPickFolders)}
					className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12px] text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--folder-multiple-outline] h-4 w-4 text-muted-foreground" />
					选择文件夹
				</button>
			</PopoverContent>
		</Popover>
	);
}

