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
				<Button
					type="button"
					variant="ghost"
					onClick={() => runAndClose(onPickFiles)}
					className="h-8 w-full justify-start px-2.5 text-[12px] text-foreground"
				>
					<span className="icon-[mdi--file-multiple-outline] h-4 w-4 text-muted-foreground" />
					选择文件
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => runAndClose(onPickFolders)}
					className="h-8 w-full justify-start px-2.5 text-[12px] text-foreground"
				>
					<span className="icon-[mdi--folder-multiple-outline] h-4 w-4 text-muted-foreground" />
					选择文件夹
				</Button>
			</PopoverContent>
		</Popover>
	);
}
