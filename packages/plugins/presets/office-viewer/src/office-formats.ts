export const SPREADSHEET_EXTENSIONS = ["xls", "xlsx", "xlsm", "xlsb", "ods"] as const;

export const OFFICE_EXTENSIONS = ["pdf", "docx", ...SPREADSHEET_EXTENSIONS, "ppt", "pptx"];

export function isSpreadsheetExtension(extension: string): boolean {
	return SPREADSHEET_EXTENSIONS.some((candidate) => candidate === extension);
}
