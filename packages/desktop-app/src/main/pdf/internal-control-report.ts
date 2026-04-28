import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { renderHtmlFileToPdf } from "./html-to-pdf.js";
import { defaultTemplate } from "./templates/default.js";
import type {
	InternalControlReportData,
	InternalControlReportPdfOptions,
	InternalControlReportPdfResult,
	InternalControlReportTemplate,
} from "./types.js";

export class InternalControlReportError extends Error {
	constructor(
		readonly code: "VALIDATION_ERROR" | "TEMPLATE_NOT_FOUND" | "READ_ERROR" | "RENDER_ERROR",
		message: string,
	) {
		super(message);
		this.name = "InternalControlReportError";
	}
}

const templates: Record<string, InternalControlReportTemplate> = {
	default: defaultTemplate,
};

function assertReportData(value: unknown): asserts value is InternalControlReportData {
	if (typeof value !== "object" || value === null) {
		throw new InternalControlReportError("VALIDATION_ERROR", "result.json 内容不是有效对象");
	}
	const data = value as Record<string, unknown>;
	if (typeof data.unit_name !== "string" || data.unit_name.length === 0) {
		throw new InternalControlReportError("VALIDATION_ERROR", "result.json 缺少有效的 unit_name 字段");
	}
	if (typeof data.unit_code !== "string" || data.unit_code.length === 0) {
		throw new InternalControlReportError("VALIDATION_ERROR", "result.json 缺少有效的 unit_code 字段");
	}
	if (!Array.isArray(data.items) || data.items.length === 0) {
		throw new InternalControlReportError("VALIDATION_ERROR", "result.json 中 items 为空，没有审查结果可生成报告");
	}
	if (!data.end_time) {
		throw new InternalControlReportError(
			"VALIDATION_ERROR",
			"result.json 尚未 finalize（end_time 为空），请先执行 finalize 再生成报告",
		);
	}
	if (typeof data.file_total_size_mb !== "number") {
		throw new InternalControlReportError(
			"VALIDATION_ERROR",
			"result.json 缺少有效的 file_total_size_mb 字段，请使用新版 init 命令重新初始化",
		);
	}
	if (typeof data.report_date !== "string" || data.report_date.length === 0) {
		throw new InternalControlReportError(
			"VALIDATION_ERROR",
			"result.json 缺少有效的 report_date 字段，请使用新版 init 命令重新初始化",
		);
	}
	if (typeof data.budget_level !== "string" || data.budget_level.length === 0) {
		throw new InternalControlReportError(
			"VALIDATION_ERROR",
			"result.json 缺少有效的 budget_level 字段，请使用新版 init 命令重新初始化",
		);
	}
	if (typeof data.unit_budget_level !== "string" || data.unit_budget_level.length === 0) {
		throw new InternalControlReportError(
			"VALIDATION_ERROR",
			"result.json 缺少有效的 unit_budget_level 字段，请使用新版 init 命令重新初始化",
		);
	}
	for (let i = 0; i < data.items.length; i++) {
		const item = data.items[i] as Record<string, unknown>;
		if (typeof item.review_item !== "string" || typeof item.result !== "string" || !Array.isArray(item.evidence)) {
			throw new InternalControlReportError(
				"VALIDATION_ERROR",
				`items[${i}] 数据不完整，缺少 review_item/result/evidence 字段`,
			);
		}
	}
}

function defaultOutputPath(resultPath: string, data: InternalControlReportData): string {
	return join(dirname(resultPath), `${data.unit_name}_${data.unit_code}_审查报告.pdf`);
}

export async function generateInternalControlReportPdf(
	resultPath: string,
	options: InternalControlReportPdfOptions = {},
): Promise<InternalControlReportPdfResult> {
	const absResultPath = resolve(resultPath);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(absResultPath, "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new InternalControlReportError("READ_ERROR", `读取 JSON 失败: ${message}`);
	}

	assertReportData(parsed);
	const templateId = options.template ?? "default";
	const template = templates[templateId];
	if (!template) {
		throw new InternalControlReportError("TEMPLATE_NOT_FOUND", `未知报告模板: ${templateId}`);
	}

	const output = resolve(options.output ?? defaultOutputPath(absResultPath, parsed));
	const tmpDir = await mkdtemp(join(tmpdir(), "icr-report-"));
	const htmlPath = join(tmpDir, "report.html");

	try {
		const html = template.renderHtml(parsed, { titleYear: options.titleYear ?? 2025 });
		await writeFile(htmlPath, html, "utf8");
		await renderHtmlFileToPdf({
			htmlPath,
			outputPath: output,
			pageSize: "A4",
		});
		return { output, template: template.id, renderer: "electron" };
	} catch (error) {
		if (error instanceof InternalControlReportError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		throw new InternalControlReportError("RENDER_ERROR", `Electron PDF 渲染失败: ${message}`);
	} finally {
		if (!options.keepTemp) {
			await rm(tmpDir, { recursive: true, force: true });
		}
	}
}
