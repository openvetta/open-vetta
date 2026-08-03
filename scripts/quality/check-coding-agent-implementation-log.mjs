/** Ensure every Coding Agent rewrite record from stage 225 carries the fixed rewrite charter. */

import { join } from "node:path";
import { fail, isDirectRun, ok, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

export const REWRITE_CHARTER_START = "<!-- coding-agent-rewrite-charter:v1:start -->";
export const REWRITE_CHARTER_END = "<!-- coding-agent-rewrite-charter:v1:end -->";
export const GOVERNED_STAGE_START = 225;

const REQUIRED_STAGE_HEADINGS = Object.freeze([
	"## 本阶段与最终目标的关系",
	"## 旧实现依赖变化",
	"## 行为兼容性验证",
	"## 尚未完成的替换",
]);

export function findCodingAgentImplementationLogViolations({ charterText, logs }) {
	const violations = [];
	const charterBlock = extractCharterBlock(charterText);
	if (!charterBlock) {
		return ["REWRITE-CHARTER.md: fixed rewrite charter block is missing or malformed"];
	}
	const governedLogs = [];
	const stagePaths = new Map();
	for (const log of logs) {
		const fileName = log.path.split("/").at(-1) ?? "";
		const stageMatch = /^(\d+)-.+\.md$/.exec(fileName);
		if (!stageMatch) continue;
		const stage = Number(stageMatch[1]);
		if (stage < GOVERNED_STAGE_START) continue;
		governedLogs.push(log);
		const existingPath = stagePaths.get(stage);
		if (existingPath) violations.push(`${log.path}: duplicate stage ${stage} (already used by ${existingPath})`);
		else stagePaths.set(stage, log.path);
	}

	for (const log of governedLogs) {
		const actualBlock = extractCharterBlock(log.text);
		if (actualBlock !== charterBlock) {
			violations.push(`${log.path}: fixed rewrite charter block differs from REWRITE-CHARTER.md`);
		}
		for (const heading of REQUIRED_STAGE_HEADINGS) {
			if (!log.text.includes(heading)) violations.push(`${log.path}: required heading is missing (${heading})`);
		}
	}
	return violations;
}

function extractCharterBlock(text) {
	const start = text.indexOf(REWRITE_CHARTER_START);
	const end = text.indexOf(REWRITE_CHARTER_END);
	if (start < 0 || end < start) return undefined;
	return text.slice(start, end + REWRITE_CHARTER_END.length).replaceAll("\r\n", "\n");
}

if (isDirectRun(import.meta.url)) {
	const logDirectory = join(repoRoot, "docs/agent/coding-agent/05-greenfield-rewrite/08-implementation-log");
	const charterText = readText(join(logDirectory, "REWRITE-CHARTER.md"));
	const logs = walkFiles(logDirectory, { extensions: [".md"] })
		.map((filePath) => ({ path: rel(filePath), text: readText(filePath) }))
		.filter((file) => !file.path.endsWith("/REWRITE-CHARTER.md"));
	const violations = findCodingAgentImplementationLogViolations({ charterText, logs });
	if (violations.length > 0) {
		for (const violation of violations) fail(`[coding-agent-log] ${violation}`);
	} else {
		ok(
			`[coding-agent-log] ok (${logs.filter((log) => /\/(?:22[5-9]|2[3-9]\d|[3-9]\d{2,})-/.test(log.path)).length} governed record(s))`,
		);
	}
}
