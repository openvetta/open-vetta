import { useSetAtom } from "jotai";
import { selectedFilePathAtom } from "../../store/atoms";
import { getFileIcon } from "../Sidebar/FileExplorer/fileIcons";

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
		<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
			<span className={`${icon} shrink-0 text-[14px] text-[var(--text-3)]`} />
			<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-2)]">
				{fileName}
			</span>
			<button
				type="button"
				title="关闭文件预览"
				onClick={() => setSelectedFile(null)}
				className="shrink-0 rounded p-0.5 text-[var(--text-3)] hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
			>
				<span className="icon-[mdi--close] text-[16px]" />
			</button>
		</div>
	);
}
