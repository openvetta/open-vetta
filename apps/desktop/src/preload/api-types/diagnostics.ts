export interface DiagnosticsExportOptions {
	/** 系统保存对话框的标题，按当前界面语言传入。 */
	readonly dialogTitle?: string;
}

/** 用户在保存对话框里取消时 canceled 为 true，此时没有写出任何文件。 */
export type DiagnosticsExportResult =
	| { readonly canceled: true }
	| { readonly canceled: false; readonly zipPath: string };

export interface DesktopDiagnosticsApi {
	exportDiagnosticsPackage(options?: DiagnosticsExportOptions): Promise<DiagnosticsExportResult>;
	getLogDir(): Promise<string>;
}
