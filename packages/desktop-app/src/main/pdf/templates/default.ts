import type { InternalControlReportData, InternalControlReportTemplate, TemplateRenderOptions } from "../types.js";

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function displayDate(value: unknown): string {
	const text = String(value || "--");
	const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? match[1] : text;
}

function durationMinutes(startTime: string | undefined, endTime: string | undefined): string {
	if (!startTime || !endTime) return "--";
	const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
	if (duration < 0 || Number.isNaN(duration)) return "--";
	if (duration === 0) return "0";
	return String(Math.max(1, Math.round(duration / 60000)));
}

function sortedItems(data: InternalControlReportData): InternalControlReportData["items"] {
	return [
		...data.items.filter((item) => item.result === "有风险"),
		...data.items.filter((item) => item.result === "警示"),
		...data.items.filter((item) => item.result === "无风险"),
	];
}

export const defaultTemplate: InternalControlReportTemplate = {
	id: "default",
	renderHtml(data: InternalControlReportData, options: TemplateRenderOptions): string {
		const e = escapeHtml;
		const total = data.items.length;
		const riskCount = data.risk_count ?? data.items.filter((item) => item.result === "有风险").length;
		const warningCount = data.warning_count ?? data.items.filter((item) => item.result === "警示").length;
		const noRiskCount = data.no_risk_count ?? data.items.filter((item) => item.result === "无风险").length;
		const reportNo = data.review_code || `CZ-${data.unit_code}-0000`;
		const titleYear = options.titleYear ?? 2025;

		const summaryRows = data.items
			.map((item, index) => {
				const resultClass = item.result === "有风险" ? "red-text" : item.result === "警示" ? "amber-text" : "";
				return `<tr><td>${index + 1}.　${e(item.review_item)}</td><td class="${resultClass}">${e(item.result)}</td></tr>`;
			})
			.join("\n");

		const detailBlocks = sortedItems(data)
			.map((item) => {
				const resultClass = item.result === "有风险" ? "risk" : item.result === "警示" ? "warn" : "normal";
				const evidence = item.evidence.map((entry) => e(entry.detail)).join("；") || "--";
				const reason = item.reason ? `<tr><td class="detail-label">说明:</td><td>${e(item.reason)}</td></tr>` : "";
				const textClass = resultClass === "risk" ? "red-text" : resultClass === "warn" ? "amber-text" : "";
				return `<table class="detail-table ${resultClass}">
	<tr><td class="detail-label">审查事项:</td><td class="strong">${e(item.review_item)}</td></tr>
	<tr><td class="detail-label">判定结果:</td><td class="${textClass}">${e(item.result)}</td></tr>
	<tr><td class="detail-label">相关指标:</td><td>${e(item.related_indicators || "--")}</td></tr>
	${reason}
	<tr><td class="detail-label">审查依据:</td><td>${evidence}</td></tr>
</table>`;
			})
			.join("\n");

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${e(data.unit_name)} - 内控审查报告</title>
<style>
:root {
	--blue: #0f4db3;
	--deep: #17356f;
	--line: #9fbbe5;
	--light-line: #cbd9f1;
	--red: #d9403a;
	--red-line: #ff9b9b;
	--amber: #c28200;
	--amber-line: #e8c85a;
	--text: #242832;
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: #fff;
	color: var(--text);
	font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", Arial, sans-serif;
	font-size: 16px;
	line-height: 1.35;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}
@page { size: A4; margin: 8mm 10mm; }
.page { max-width: 1055px; margin: 0 auto; padding: 20px 35px 14px; }
.header {
	text-align: center;
	color: var(--deep);
	padding-bottom: 12px;
	border-bottom: 3px solid var(--blue);
}
.header-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: #666;
	font-size: 13px;
	margin-bottom: 4px;
}
h1 {
	margin: 0;
	font-family: "STSong", "SimSun", "Microsoft YaHei", serif;
	font-size: 38px;
	line-height: 1.1;
	font-weight: 800;
	letter-spacing: 3px;
}
.subtitle { margin-top: 6px; font-size: 18px; color: #213863; }
.notice, .footer-note {
	margin-top: 10px;
	padding: 6px 14px;
	border: 1px dashed var(--line);
	border-radius: 4px;
	font-size: 13px;
	color: #555;
}
.info-table, .summary-table, .detail-table {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
}
.info-table {
	margin-top: 18px;
	border: 1px solid var(--line);
	font-size: 15px;
}
.info-table td {
	height: 36px;
	border: 1px solid var(--line);
	padding: 6px 14px;
	vertical-align: middle;
}
.info-label { width: 22%; font-weight: 700; white-space: nowrap; }
.info-value { width: 28%; }
.stats {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
	margin-top: 10px;
}
.stat-card {
	border: 1px solid #9bbbea;
	border-radius: 8px;
	background: linear-gradient(180deg, #fff, #f7faff);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 8px 10px;
}
.stat-card.risk { border-color: var(--red-line); background: #fffafa; }
.stat-card.warn { border-color: var(--amber-line); background: #fffbf0; }
.stat-title { font-size: 11px; color: #555; font-weight: 600; white-space: nowrap; }
.stat-num { color: var(--blue); font-size: 20px; line-height: 1; font-weight: 800; }
.risk .stat-num { color: var(--red); }
.warn .stat-num { color: var(--amber); }
.section {
	margin-top: 8px;
	border: 1px solid var(--line);
	border-radius: 5px;
	overflow: hidden;
	background: #fff;
	padding: 0 16px 12px;
}
.section-title {
	margin: 0 0 6px;
	color: var(--blue);
	font-size: 22px;
	line-height: 1.35;
	font-weight: 800;
	letter-spacing: .6px;
	padding-top: 10px;
}
.summary-table {
	font-size: 15px;
	margin-top: 1px;
	border: 1px solid var(--line);
}
.summary-table th {
	height: 28px;
	color: #163775;
	background: #eef5ff;
	border: 1px solid var(--line);
	font-weight: 800;
	text-align: center;
}
.summary-table td {
	height: 25px;
	padding: 2px 16px;
	border: 1px dashed var(--light-line);
	vertical-align: middle;
	line-height: 1.15;
}
.summary-table col:first-child { width: 75%; }
.detail-table {
	margin-bottom: 8px;
	border: 1px solid var(--line);
	font-size: 15px;
	page-break-inside: avoid;
}
.detail-table.risk { border-color: var(--red-line); }
.detail-table.warn { border-color: var(--amber-line); }
.detail-table td {
	padding: 6px 16px;
	border: 1px solid var(--light-line);
	vertical-align: middle;
	line-height: 1.35;
}
.detail-table.risk td { border-color: #f2b0b0; }
.detail-table.warn td { border-color: #e8d5a0; }
.detail-label {
	width: 15%;
	text-align: center;
	font-weight: 700;
	background: #f7faff;
	white-space: nowrap;
}
.risk .detail-label { background: #fff4f4; }
.warn .detail-label { background: #fffbf0; }
.strong { font-weight: 700; }
.red-text { color: #e60012; font-weight: 700; }
.amber-text { color: var(--amber); font-weight: 700; }
</style>
</head>
<body>
<main class="page">
	<header class="header">
		<div class="header-meta">
			<div>单位层级： ${e(data.budget_level || "--")}</div>
			<div>报告编号： ${e(reportNo)}</div>
		</div>
		<h1>内部控制审查报告</h1>
		<div class="subtitle">${titleYear}年内部控制审查情况</div>
	</header>
	<div class="notice">本报告是由<strong>宁波市财政局智能审查平台</strong>全量审查·自主核验·自动生成的结果 | 结论仅供参考。</div>
	<table class="info-table">
		<tr><td class="info-label">单位名称:</td><td class="info-value">${e(data.unit_name)}</td><td class="info-label">单位代码:</td><td class="info-value">${e(data.unit_code)}</td></tr>
		<tr><td class="info-label">审查事项总数:</td><td>${total}</td><td class="info-label">风险事项:</td><td>${riskCount}</td></tr>
		<tr><td class="info-label">无风险事项:</td><td>${noRiskCount}</td><td class="info-label">警示事项:</td><td>${warningCount}</td></tr>
		<tr><td class="info-label">文件总大小:</td><td>${e(data.file_total_size_mb)} MB</td><td class="info-label">报送日期:</td><td>${e(displayDate(data.report_date))}</td></tr>
		<tr><td class="info-label">其他:</td><td colspan="3">于${e(data.start_time)}开始审查，耗时${durationMinutes(data.start_time, data.end_time)}分钟</td></tr>
	</table>
	<section class="stats">
		<div class="stat-card"><div class="stat-title">审查事项</div><div class="stat-num">${total}</div></div>
		<div class="stat-card risk"><div class="stat-title">风险事项</div><div class="stat-num">${riskCount}</div></div>
		<div class="stat-card warn"><div class="stat-title">警示事项</div><div class="stat-num">${warningCount}</div></div>
		<div class="stat-card"><div class="stat-title">无风险事项</div><div class="stat-num">${noRiskCount}</div></div>
	</section>
	<section class="section">
		<h2 class="section-title">一、审查结果摘要</h2>
		<table class="summary-table"><colgroup><col><col></colgroup><thead><tr><th>审查内容</th><th>审查结果</th></tr></thead><tbody>${summaryRows}</tbody></table>
	</section>
	<section class="section" style="page-break-before: always">
		<h2 class="section-title">二、审查事项明细</h2>
		${detailBlocks}
	</section>
	<div class="footer-note">本报告是由<strong>宁波市财政局智能审查平台</strong>全量审查·自主核验·自动生成的结果 | 结论仅供参考。</div>
</main>
</body>
</html>`;
	},
};
