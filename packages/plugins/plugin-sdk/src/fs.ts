export interface PluginFsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export interface PluginFsFileRef {
	name: string;
	path: string;
	relPath: string;
}

export interface PluginFsStatResult {
	size: number;
	modifiedAt: number;
	createdAt: number;
}

export interface PluginFsReadResult {
	content: string;
	encoding: "utf8" | "base64";
}

export interface PluginFsApi {
	readDir(dirPath: string): Promise<PluginFsEntry[]>;
	readFile(filePath: string): Promise<PluginFsReadResult>;
	/** Pass `encoding: "base64"` to write binary payloads (decoded from base64 text). */
	writeFile(filePath: string, content: string, encoding?: "utf8" | "base64"): Promise<void>;
	stat(filePath: string): Promise<PluginFsStatResult | null>;
	rename(oldPath: string, newPath: string): Promise<void>;
	delete(targetPath: string): Promise<void>;
	move(sourcePath: string, destDir: string): Promise<void>;
	createDirectory(dirPath: string): Promise<void>;
	listFilesRecursive(rootPath: string): Promise<PluginFsFileRef[]>;
}
