export interface FsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export interface FsStatResult {
	size: number;
	modifiedAt: number;
	createdAt: number;
}

export interface DesktopFsApi {
	readDir(dirPath: string): Promise<FsEntry[]>;
	readFile(filePath: string): Promise<{ content: string; encoding: "utf8" | "base64" }>;
	writeFile(filePath: string, content: string): Promise<void>;
	stat(filePath: string): Promise<FsStatResult | null>;
	rename(oldPath: string, newPath: string): Promise<void>;
	delete(targetPath: string): Promise<void>;
	move(sourcePath: string, destDir: string): Promise<void>;
	createDirectory(dirPath: string): Promise<void>;
	listSubDirs(dirPath: string): Promise<FsEntry[]>;
	watchDir(dirPath: string): Promise<void>;
	unwatchDir(dirPath: string): Promise<void>;
	onDirChanged(handler: (dirPath: string) => void): () => void;
	/**
	 * 同步获取 drag-and-drop / `<input type=file>` File 对象的绝对路径。
	 * Electron 32+ 已移除 `File.path`，统一通过 preload 的 webUtils 转换。
	 * 返回空字符串表示该 File 不来自真实文件系统（例如来自剪贴板的合成 File）。
	 */
	pathForFile(file: File): string;
}
