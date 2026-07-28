// 宿主在 renderer 暴露的最小 fs 子集（first-party 插件，无沙箱）。
// SDK 暂未提供文件监听，故直接用宿主 window.vetta.fs.watchDir/onDirChanged。
interface VettaFsBridge {
	readFile(filePath: string): Promise<{ content: string; encoding: "utf8" | "base64" }>;
	watchDir(dirPath: string): Promise<void>;
	unwatchDir(dirPath: string): Promise<void>;
	onDirChanged(handler: (dirPath: string) => void): () => void;
}

interface Window {
	vetta?: { fs: VettaFsBridge };
	mxClient?: { NO_FO: boolean };
	GraphViewer?: { processElements: () => void };
}
