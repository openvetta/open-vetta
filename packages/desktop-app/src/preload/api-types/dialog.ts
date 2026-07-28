export interface SelectedImageFile {
	data: string;
	mimeType: string;
	name: string;
}

export interface PersistImageInput {
	/** Stable id used as the on-disk file name */
	id: string;
	/** Base64-encoded image data (no data URI prefix) */
	data: string;
	mimeType: string;
}

export interface DialogSaveCopyOptions {
	/** Suggested file name in the save dialog (defaults to basename of source). */
	defaultFileName?: string;
	title?: string;
	filters?: Array<{ name: string; extensions: string[] }>;
}

export interface DesktopDialogApi {
	selectFolder(): Promise<string | null>;
	selectFolders(): Promise<string[]>;
	selectImages(): Promise<SelectedImageFile[]>;
	selectFiles(defaultPath?: string): Promise<string[]>;
	/** 使用原生保存对话框写出单文件 HTML；取消时返回 null。 */
	saveHtml(defaultFileName: string, content: string): Promise<string | null>;
	/**
	 * 经原生保存对话框把已有文件复制到用户选择的路径。
	 * 源路径需可读（项目根或用户主目录）；取消时返回 null。
	 */
	saveCopy(sourcePath: string, options?: DialogSaveCopyOptions): Promise<string | null>;
	/**
	 * 把附加图片落盘到 ~/.vetta/image-cache/<sessionId>/，返回绝对路径。
	 * 用于以 @路径 方式引用图片，避免把 base64 直接塞进上下文。
	 */
	persistImages(sessionId: string, images: PersistImageInput[]): Promise<string[]>;
}
