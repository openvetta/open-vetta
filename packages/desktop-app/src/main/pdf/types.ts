export interface InternalControlEvidence {
	file?: string;
	detail: string;
}

export interface InternalControlReportItem {
	category?: string;
	group?: string;
	review_item: string;
	related_indicators?: string;
	result: "有风险" | "警示" | "无风险" | string;
	reason?: string;
	evidence: InternalControlEvidence[];
	start_time?: string;
	end_time?: string;
}

export interface InternalControlReportData {
	unit_name: string;
	unit_code: string;
	review_code?: string;
	file_total_size_mb: number;
	report_date: string;
	budget_level: string;
	unit_budget_level: string;
	risk_count?: number;
	no_risk_count?: number;
	warning_count?: number;
	start_time?: string;
	end_time: string;
	items: InternalControlReportItem[];
}

export interface TemplateRenderOptions {
	titleYear?: number;
}

export interface InternalControlReportTemplate {
	id: string;
	renderHtml: (data: InternalControlReportData, options: TemplateRenderOptions) => string;
}

export interface InternalControlReportPdfOptions extends TemplateRenderOptions {
	output?: string;
	template?: string;
	keepTemp?: boolean;
}

export interface InternalControlReportPdfResult {
	output: string;
	template: string;
	renderer: "electron";
}
