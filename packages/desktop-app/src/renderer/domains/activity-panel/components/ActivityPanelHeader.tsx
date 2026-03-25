import { useSetAtom } from "jotai";
import { selectedFilePathAtom } from "@shared/store/atoms";
import { getFileIcon } from "@domains/file-explorer/components/fileIcons";
import { Button } from "@shared/components/ui/button";

interface ActivityPanelHeaderProps {
	filePath: string;
}

function getFileName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1] || filePath;
}

export function ActivityPanelHeader({ filePath }: ActivityPanelHeaderProps): JSX.Element {
	const setSelectedFile = useSetAtom(selectedFilePathAtom);
	const fileName = getFileName(filePath);
	const icon = getFileIcon(fileName, false, false);

	return (
		<div className="flex items-center gap-2 border-b border-border px-3 py-2">
			<span className={`${icon} shrink-0 text-[14px] text-muted-foreground/50`} />
			<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground">
				{fileName}
			</span>
			<Button variant="ghost" size="icon-xs" title="关闭文件预览" onClick={() => setSelectedFile(null)} className="shrink-0">
				<span className="icon-[mdi--close] text-[16px]" />
			</Button>
		</div>
	);
}
