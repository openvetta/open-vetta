export interface FsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export interface DesktopFsApi {
	readDir(dirPath: string): Promise<FsEntry[]>;
	readFile(filePath: string): Promise<{ content: string; encoding: "utf8" | "base64" }>;
	rename(oldPath: string, newPath: string): Promise<void>;
	delete(targetPath: string): Promise<void>;
	move(sourcePath: string, destDir: string): Promise<void>;
	createDirectory(dirPath: string): Promise<void>;
	listSubDirs(dirPath: string): Promise<FsEntry[]>;
}
