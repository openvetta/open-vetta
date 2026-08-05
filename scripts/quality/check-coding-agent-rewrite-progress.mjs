/**
 * Track the complete Coding Agent rewrite independently from Legacy execution retirement.
 * Existing old-implementation edges are an exact baseline: every change must update the
 * baseline deliberately, and the final target for every reported category is zero.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";
import { RETAINED_LEGACY_FORMAT_BOUNDARIES } from "./check-legacy-execution-retirement.mjs";
import { fail, isDirectRun, ok, readText, rel, repoRoot, toPosix, walkFiles } from "./lib.mjs";

export const REWRITE_BASELINE_PATH = "scripts/quality/baselines/coding-agent-rewrite.json";

const OLD_CORE_PREFIX = "packages/coding-agent/src/core/";
const STABLE_EXTENSION_CONTRACT_PREFIX = "packages/coding-agent/src/extensions/";
const STABLE_RESOURCE_DOMAIN_PREFIX = "packages/coding-agent/src/resources/";
const STABLE_EXTENSION_CONTRACT_AGGREGATE = `${STABLE_EXTENSION_CONTRACT_PREFIX}contracts.ts`;
const MAX_EXTENSION_AGGREGATE_LINES = 50;
const MAX_EXTENSION_MODULE_LINES = 300;
const STABLE_RESOURCE_AGGREGATE = `${STABLE_RESOURCE_DOMAIN_PREFIX}index.ts`;
const MAX_RESOURCE_AGGREGATE_LINES = 50;
const MAX_RESOURCE_MODULE_LINES = 600;
const FORBIDDEN_LEGACY_HTML_EXPORT_MARKERS = Object.freeze([
	"core/export-html",
	"installExportTemplateAssets",
	"@vetta/coding-agent/export-template-assets",
]);
const FORBIDDEN_LEGACY_MEMORY_MARKERS = Object.freeze([
	"core/memory/",
	"core/tools/memory/",
	"greenfield-memory-rollover-orchestrator",
]);
const FORBIDDEN_RETIRED_TOOL_MARKERS = Object.freeze([
	"core/tools/",
	"core/background-tasks/",
	"core/session/tool-scope",
	"core/todo-store",
	"generate-tool-descriptions",
	"generate:descriptions",
]);
const RUNTIME_PACKAGE_PREFIXES = Object.freeze([
	"packages/runtime-core/src/",
	"packages/runtime-tools/src/",
	"packages/runtime-storage/src/",
	"packages/runtime-mcp/src/",
]);
const OLD_IMPLEMENTATION_EXACT_FILES = Object.freeze([
	"packages/coding-agent/src/adapters/runtime-core/greenfield-model-registry-adapter.ts",
	"packages/coding-agent/src/adapters/runtime-core/model-registry-shared-model-controller.ts",
	"packages/coding-agent/src/modes/rpc/legacy-rpc-session-adapter.ts",
	"packages/coding-agent/src/public-api/compat-runtime-storage.ts",
	"packages/coding-agent/src/public-api/compat-runtime-tools.ts",
	"packages/coding-agent/src/public-api/model-registry-compat.ts",
	"packages/coding-agent/src/public-api/sdk-compatibility-inventory.ts",
]);

export function collectCodingAgentRewriteState({
	productionFiles,
	sdkExampleFiles,
	codingAgentPackageJson,
	governedFiles = productionFiles,
}) {
	const moduleEdges = productionFiles.flatMap((file) => collectModuleEdges(file.path, file.text));
	const oldImplementationEdges = moduleEdges
		.filter((edge) => !isOldImplementationFile(edge.path))
		.flatMap((edge) => classifyOldImplementationEdge(edge))
		.sort(compareRecords);
	const runtimeBackedges = moduleEdges
		.filter(
			(edge) =>
				RUNTIME_PACKAGE_PREFIXES.some((prefix) => edge.path.startsWith(prefix)) &&
				edge.specifier.startsWith("@vetta/coding-agent"),
		)
		.map(toBaselineEdge)
		.sort(compareRecords);
	const oldImplementationFiles = productionFiles
		.map((file) => file.path)
		.filter(isOldImplementationFile)
		.sort();
	const compatibilityExports = Object.keys(codingAgentPackageJson.exports ?? {})
		.filter((exportName) => exportName.startsWith("./compat/"))
		.sort();
	const legacyCoreExports = Object.keys(codingAgentPackageJson.exports ?? {})
		.filter((exportName) => exportName.startsWith("./core/"))
		.sort();
	const legacyExampleImports = sdkExampleFiles
		.flatMap((file) => collectModuleEdges(file.path, file.text))
		.filter(
			(edge) => edge.specifier === "@vetta/coding-agent" || edge.specifier.startsWith("@vetta/coding-agent/compat/"),
		)
		.map(toBaselineEdge)
		.sort(compareRecords);
	const oversizedStableExtensionModules = productionFiles
		.filter((file) => file.path.startsWith(STABLE_EXTENSION_CONTRACT_PREFIX) && file.path.endsWith(".ts"))
		.map((file) => ({
			path: file.path,
			lines: file.text.split(/\r?\n/).length,
			limit:
				file.path === STABLE_EXTENSION_CONTRACT_AGGREGATE
					? MAX_EXTENSION_AGGREGATE_LINES
					: MAX_EXTENSION_MODULE_LINES,
		}))
		.filter((file) => file.lines > file.limit)
		.sort((left, right) => left.path.localeCompare(right.path));
	const oversizedStableResourceModules = productionFiles
		.filter((file) => file.path.startsWith(STABLE_RESOURCE_DOMAIN_PREFIX) && file.path.endsWith(".ts"))
		.map((file) => ({
			path: file.path,
			lines: file.text.split(/\r?\n/).length,
			limit: file.path === STABLE_RESOURCE_AGGREGATE ? MAX_RESOURCE_AGGREGATE_LINES : MAX_RESOURCE_MODULE_LINES,
		}))
		.filter((file) => file.lines > file.limit)
		.sort((left, right) => left.path.localeCompare(right.path));
	const legacyHtmlExportReferences = governedFiles
		.flatMap((file) => collectForbiddenHtmlExportReferences(file))
		.sort(
			(left, right) =>
				left.path.localeCompare(right.path) || left.line - right.line || left.marker.localeCompare(right.marker),
		);
	const legacyMemoryReferences = governedFiles
		.flatMap((file) => collectForbiddenReferences(file, FORBIDDEN_LEGACY_MEMORY_MARKERS))
		.sort(
			(left, right) =>
				left.path.localeCompare(right.path) || left.line - right.line || left.marker.localeCompare(right.marker),
		);
	const retiredToolReferences = governedFiles
		.flatMap((file) => collectForbiddenReferences(file, FORBIDDEN_RETIRED_TOOL_MARKERS))
		.sort(
			(left, right) =>
				left.path.localeCompare(right.path) || left.line - right.line || left.marker.localeCompare(right.marker),
		);

	return Object.freeze({
		version: 5,
		oldImplementationEdges,
		runtimeBackedges,
		oldImplementationFiles,
		compatibilityExports,
		legacyCoreExports,
		legacyExampleImports,
		oversizedStableExtensionModules,
		oversizedStableResourceModules,
		legacyHtmlExportReferences,
		legacyMemoryReferences,
		retiredToolReferences,
	});
}

export function findCodingAgentRewriteProgressViolations(actual, baseline) {
	const violations = [];
	for (const edge of actual.oldImplementationEdges) {
		if (edge.path.startsWith(STABLE_EXTENSION_CONTRACT_PREFIX)) {
			violations.push(`${edge.path}: stable Extension contract depends on old implementation (${edge.specifier})`);
		}
		if (edge.path.startsWith(STABLE_RESOURCE_DOMAIN_PREFIX)) {
			violations.push(`${edge.path}: stable Resource domain depends on old implementation (${edge.specifier})`);
		}
	}
	for (const file of actual.oversizedStableExtensionModules) {
		violations.push(`${file.path}: stable Extension module has ${file.lines} lines (limit ${file.limit})`);
	}
	for (const file of actual.oversizedStableResourceModules) {
		violations.push(`${file.path}: stable Resource module has ${file.lines} lines (limit ${file.limit})`);
	}
	for (const reference of actual.legacyHtmlExportReferences) {
		violations.push(
			`${reference.path}:${reference.line}: forbidden Legacy HTML export reference (${reference.marker})`,
		);
	}
	for (const reference of actual.legacyMemoryReferences) {
		violations.push(`${reference.path}:${reference.line}: forbidden Legacy Memory reference (${reference.marker})`);
	}
	for (const reference of actual.retiredToolReferences) {
		violations.push(
			`${reference.path}:${reference.line}: retired Tool implementation reference (${reference.marker})`,
		);
	}
	if (baseline.version !== actual.version) {
		violations.push(`rewrite baseline version differs (${baseline.version} !== ${actual.version})`);
	}
	compareBaselineRecords(
		"old implementation dependency",
		actual.oldImplementationEdges,
		baseline.oldImplementationEdges,
		violations,
	);
	compareBaselineRecords("Runtime package backedge", actual.runtimeBackedges, baseline.runtimeBackedges, violations);
	compareBaselineValues(
		"old implementation file",
		actual.oldImplementationFiles,
		baseline.oldImplementationFiles,
		violations,
	);
	compareBaselineValues(
		"compatibility package export",
		actual.compatibilityExports,
		baseline.compatibilityExports,
		violations,
	);
	compareBaselineValues(
		"legacy core package export",
		actual.legacyCoreExports,
		baseline.legacyCoreExports,
		violations,
	);
	compareBaselineRecords(
		"legacy SDK example import",
		actual.legacyExampleImports,
		baseline.legacyExampleImports,
		violations,
	);
	return violations;
}

export function summarizeCodingAgentRewriteState(state) {
	const domains = new Map();
	for (const edge of state.oldImplementationEdges) {
		domains.set(edge.domain, (domains.get(edge.domain) ?? 0) + 1);
	}
	const formatBoundarySet = new Set(RETAINED_LEGACY_FORMAT_BOUNDARIES);
	return Object.freeze({
		oldImplementationEdges: state.oldImplementationEdges.length,
		runtimeBackedges: state.runtimeBackedges.length,
		oldImplementationFiles: state.oldImplementationFiles.length,
		compatibilityExports: state.compatibilityExports.length,
		legacyCoreExports: state.legacyCoreExports.length,
		legacyExampleImports: state.legacyExampleImports.length,
		legacyHtmlExportReferences: state.legacyHtmlExportReferences.length,
		legacyMemoryReferences: state.legacyMemoryReferences.length,
		retiredToolReferences: state.retiredToolReferences.length,
		retainedFormatBoundaries: RETAINED_LEGACY_FORMAT_BOUNDARIES.length,
		formatBoundaryOldImplementationEdges: state.oldImplementationEdges.filter((edge) =>
			formatBoundarySet.has(edge.path),
		).length,
		domains: Object.fromEntries(
			[...domains].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
		),
	});
}

function collectForbiddenHtmlExportReferences(file) {
	return collectForbiddenReferences(file, FORBIDDEN_LEGACY_HTML_EXPORT_MARKERS);
}

function collectForbiddenReferences(file, markers) {
	return file.text.split(/\r?\n/).flatMap((line, index) =>
		markers
			.filter((marker) => line.includes(marker))
			.map((marker) => ({
				path: file.path,
				line: index + 1,
				marker,
			})),
	);
}

function classifyOldImplementationEdge(edge) {
	const resolvedTarget = resolveSourceTarget(edge.path, edge.specifier);
	if (resolvedTarget?.startsWith(OLD_CORE_PREFIX)) {
		return [{ ...toBaselineEdge(edge), category: "old-core", domain: readCoreDomain(resolvedTarget) }];
	}
	if (edge.specifier.startsWith("@vetta/coding-agent/core/")) {
		return [
			{
				...toBaselineEdge(edge),
				category: "old-core-public-subpath",
				domain: readCoreDomain(`packages/coding-agent/src/${edge.specifier.slice("@vetta/coding-agent/".length)}`),
			},
		];
	}
	if (
		edge.specifier.startsWith("@vetta/coding-agent/compat/") ||
		resolvedTarget?.startsWith("packages/coding-agent/src/public-api/compat-")
	) {
		return [{ ...toBaselineEdge(edge), category: "compatibility-entry", domain: "compatibility" }];
	}
	if (edge.specifier === "@vetta/coding-agent") {
		return [{ ...toBaselineEdge(edge), category: "legacy-package-root", domain: "public-api" }];
	}
	return [];
}

function collectModuleEdges(path, text) {
	if (!path.includes("/src/") && !path.includes("/examples/sdk/")) return [];
	if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) {
		return [];
	}
	const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
	const edges = [];
	const visit = (node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
			edges.push({ path, specifier: node.moduleSpecifier.text, names: collectImportNames(node.importClause) });
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
			edges.push({ path, specifier: node.moduleSpecifier.text, names: collectExportNames(node.exportClause) });
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1 &&
			ts.isStringLiteralLike(node.arguments[0])
		) {
			edges.push({ path, specifier: node.arguments[0].text, names: ["<dynamic>"] });
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return edges;
}

function collectImportNames(clause) {
	if (!clause) return ["<side-effect>"];
	const names = [];
	if (clause.name) names.push("default");
	if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
		for (const element of clause.namedBindings.elements) names.push(element.propertyName?.text ?? element.name.text);
	}
	if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push("*");
	return names.sort();
}

function collectExportNames(clause) {
	if (!clause || !ts.isNamedExports(clause)) return ["*"];
	return clause.elements.map((element) => element.propertyName?.text ?? element.name.text).sort();
}

function resolveSourceTarget(sourcePath, specifier) {
	if (!specifier.startsWith(".")) return undefined;
	return posix.normalize(posix.join(posix.dirname(sourcePath), specifier)).replace(/\.js$/, ".ts");
}

function readCoreDomain(target) {
	return target.slice(OLD_CORE_PREFIX.length).split("/")[0]?.replace(/\.ts$/, "") || "unknown";
}

function isOldImplementationFile(path) {
	return path.startsWith(OLD_CORE_PREFIX) || OLD_IMPLEMENTATION_EXACT_FILES.includes(path);
}

function toBaselineEdge(edge) {
	return Object.freeze({ path: edge.path, specifier: edge.specifier, names: [...edge.names].sort() });
}

function compareRecords(left, right) {
	return recordKey(left).localeCompare(recordKey(right));
}

function recordKey(record) {
	return `${record.path}\0${record.specifier}\0${record.names.join(",")}\0${record.category ?? ""}\0${record.domain ?? ""}`;
}

function compareBaselineRecords(label, actual, baseline, violations) {
	const actualKeys = new Map(actual.map((record) => [recordKey(record), record]));
	const baselineKeys = new Map(baseline.map((record) => [recordKey(record), record]));
	for (const [key, record] of actualKeys) {
		if (!baselineKeys.has(key)) violations.push(`${record.path}: new ${label} (${record.specifier})`);
	}
	for (const [key, record] of baselineKeys) {
		if (!actualKeys.has(key)) violations.push(`${record.path}: stale ${label} baseline (${record.specifier})`);
	}
}

function compareBaselineValues(label, actual, baseline, violations) {
	const actualSet = new Set(actual);
	const baselineSet = new Set(baseline);
	for (const value of actualSet) {
		if (!baselineSet.has(value)) violations.push(`${value}: new ${label}`);
	}
	for (const value of baselineSet) {
		if (!actualSet.has(value)) violations.push(`${value}: stale ${label} baseline`);
	}
}

function scriptKind(path) {
	if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function readProductionSources() {
	return walkFiles(join(repoRoot, "packages"))
		.map((filePath) => ({ path: rel(filePath), text: readText(filePath) }))
		.filter((file) => file.path.includes("/src/"));
}

function readSdkExamples() {
	return walkFiles(join(repoRoot, "packages/coding-agent/examples/sdk"))
		.map((filePath) => ({ path: rel(filePath), text: readText(filePath) }))
		.filter((file) => /\.[cm]?[jt]sx?$/.test(file.path));
}

function readCurrentState() {
	const codingAgentPackagePath = join(repoRoot, "packages/coding-agent/package.json");
	const codingAgentPackageText = readText(codingAgentPackagePath);
	const codingAgentPackageJson = JSON.parse(codingAgentPackageText);
	const productionFiles = readProductionSources();
	const sdkExampleFiles = readSdkExamples();
	const governedFiles = [
		...productionFiles,
		...sdkExampleFiles,
		...readSourceFiles("packages/coding-agent/test"),
		...readSourceFiles("packages/runtime-tools/test"),
		...walkFiles(join(repoRoot, "packages/cli-app/scripts")).map((filePath) => ({
			path: rel(filePath),
			text: readText(filePath),
		})),
		...walkFiles(join(repoRoot, "packages/coding-agent/scripts")).map((filePath) => ({
			path: rel(filePath),
			text: readText(filePath),
		})),
		{ path: rel(codingAgentPackagePath), text: codingAgentPackageText },
		{
			path: "scripts/build-binaries.sh",
			text: readText(join(repoRoot, "scripts/build-binaries.sh")),
		},
	];
	return collectCodingAgentRewriteState({
		productionFiles,
		sdkExampleFiles,
		codingAgentPackageJson,
		governedFiles,
	});
}

function readSourceFiles(relativePath) {
	return walkFiles(join(repoRoot, relativePath))
		.map((filePath) => ({ path: rel(filePath), text: readText(filePath) }))
		.filter((file) => /\.[cm]?[jt]sx?$/.test(file.path));
}

if (isDirectRun(import.meta.url)) {
	const actual = readCurrentState();
	if (process.argv.includes("--write-baseline")) {
		const baselinePath = join(repoRoot, REWRITE_BASELINE_PATH);
		writeFileSync(baselinePath, `${JSON.stringify(actual, null, "\t")}\n`, "utf8");
		ok(`[coding-agent-rewrite] wrote baseline: ${toPosix(REWRITE_BASELINE_PATH)}`);
	} else if (process.argv.includes("--print-baseline")) {
		console.log(JSON.stringify(actual, null, "\t"));
	} else {
		const baselinePath = join(repoRoot, REWRITE_BASELINE_PATH);
		if (!existsSync(baselinePath)) {
			fail(`[coding-agent-rewrite] missing baseline: ${toPosix(REWRITE_BASELINE_PATH)}`);
		} else {
			const baseline = JSON.parse(readText(baselinePath));
			const violations = findCodingAgentRewriteProgressViolations(actual, baseline);
			if (violations.length > 0) {
				for (const violation of violations) fail(`[coding-agent-rewrite] ${violation}`);
			} else {
				const summary = summarizeCodingAgentRewriteState(actual);
				const domains = Object.entries(summary.domains)
					.map(([domain, count]) => `${domain}=${count}`)
					.join(", ");
				ok(
					`[coding-agent-rewrite] ok (old implementation edges=${summary.oldImplementationEdges}/0, Runtime backedges=${summary.runtimeBackedges}/0, old files=${summary.oldImplementationFiles}/0, compatibility exports=${summary.compatibilityExports}/0, legacy core exports=${summary.legacyCoreExports}/0, legacy examples=${summary.legacyExampleImports}/0, Legacy HTML export references=${summary.legacyHtmlExportReferences}/0, Legacy Memory references=${summary.legacyMemoryReferences}/0, retired Tool references=${summary.retiredToolReferences}/0, retained format boundaries=${summary.retainedFormatBoundaries}, format-to-old edges=${summary.formatBoundaryOldImplementationEdges}/0; domains: ${domains || "none"})`,
				);
			}
		}
	}
}
