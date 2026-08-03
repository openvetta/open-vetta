/**
 * Freeze the remaining Legacy execution reachability before final retirement.
 * Historical session format readers and Greenfield-shared core capabilities are
 * deliberately reported separately from executable Legacy Agent entrypoints.
 */

import { join } from "node:path";
import ts from "typescript";
import { fail, isDirectRun, ok, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

export const LEGACY_EXECUTION_EDGE_BASELINE = Object.freeze([]);

export const RETAINED_LEGACY_FORMAT_BOUNDARIES = Object.freeze([
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/catalog.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/header-reader.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/history-reader.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/index.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/lease.ts",
	"packages/cli-app/src/rpc/cli-session-format-compatibility.ts",
	"packages/desktop-app/src/main/greenfield-runtime/desktop-legacy-session-format-compatibility.ts",
	"packages/desktop-app/src/main/greenfield-runtime/desktop-legacy-session-migration-backend.ts",
]);

export const LEGACY_PACKAGE_EXPORT_BASELINE = Object.freeze([]);

export const RETIRED_LEGACY_EXECUTION_FILES = Object.freeze([
	"packages/coding-agent/src/cli.ts",
	"packages/coding-agent/src/main.ts",
	"packages/coding-agent/src/modes/legacy-print-session-adapter.ts",
	"packages/coding-agent/src/public-api/legacy-cli.ts",
	"packages/coding-agent/src/public-api/legacy-host-services.ts",
	"packages/coding-agent/src/public-api/legacy-session.ts",
	"packages/coding-agent/src/public-api/legacy-tools.ts",
	"packages/coding-agent/src/adapters/runtime-core/composition.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-backend.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-ports.ts",
	"packages/coding-agent/src/adapters/runtime-core/legacy-session-services.ts",
	"packages/coding-agent/src/adapters/runtime-core/session-events.ts",
	"packages/coding-agent/src/composition/legacy-knowledge-processing-session.ts",
]);

const LEGACY_EXECUTION_SYMBOL_KINDS = new Map([
	["LegacyCodingAgentSessionBackend", "legacy-session-backend"],
	["createLegacyRuntimeHostOptions", "legacy-host-composition"],
	["createLegacyKnowledgeProcessingSessionFactory", "legacy-knowledge-execution"],
	["runLegacyRuntimeExecution", "legacy-cli-activation"],
	["createDesktopLegacyExecutionCompatibility", "desktop-legacy-execution-activation"],
]);

export function findLegacyExecutionRetirementViolations(
	files,
	{ cliAppBin, codingAgentBin, requireBaseline = false, packageExports } = {},
) {
	const violations = [];
	const sourcePaths = new Set(files.map((file) => file.path));
	const classifiedEdges = files.flatMap((file) =>
		collectModuleEdges(file.path, file.text).flatMap((moduleEdge) =>
			classifyLegacyExecutionEdge(moduleEdge).map((kind) => ({ ...moduleEdge, kind })),
		),
	);

	for (const actual of classifiedEdges) {
		if (LEGACY_EXECUTION_EDGE_BASELINE.some((allowed) => sameEdge(actual, allowed))) continue;
		violations.push(
			`${actual.path}: Legacy execution dependency is outside the retirement baseline (${actual.kind} from ${actual.specifier})`,
		);
	}

	for (const file of files) {
		if (!file.path.startsWith("packages/coding-agent/src/adapters/runtime-core/legacy-session-format/")) {
			continue;
		}
		for (const moduleEdge of collectModuleEdges(file.path, file.text)) {
			if (
				moduleEdge.specifier.includes("agent-session") ||
				moduleEdge.specifier.includes("/sdk") ||
				moduleEdge.specifier.includes("legacy-session-backend") ||
				moduleEdge.names.some((name) =>
					["AgentSession", "createAgentSession", "LegacyCodingAgentSessionBackend", "ModelRegistry"].includes(
						name,
					),
				)
			) {
				violations.push(
					`${file.path}: retained Legacy format boundary must not depend on Legacy execution (${moduleEdge.specifier})`,
				);
			}
		}
	}

	if (requireBaseline) {
		for (const retiredPath of RETIRED_LEGACY_EXECUTION_FILES) {
			if (sourcePaths.has(retiredPath)) violations.push(`${retiredPath}: retired Legacy CLI source was restored`);
		}
		for (const expected of LEGACY_EXECUTION_EDGE_BASELINE) {
			if (!classifiedEdges.some((actual) => sameEdge(actual, expected))) {
				violations.push(
					`${expected.path}: expected Legacy execution baseline edge is missing (${expected.kind} from ${expected.specifier})`,
				);
			}
		}
		for (const retainedPath of RETAINED_LEGACY_FORMAT_BOUNDARIES) {
			if (!sourcePaths.has(retainedPath)) {
				violations.push(`${retainedPath}: retained Legacy format boundary is missing`);
			}
		}
		const actualExports = Object.keys(packageExports ?? {})
			.filter((key) => key.startsWith("./legacy/"))
			.sort();
		if (actualExports.join("\0") !== [...LEGACY_PACKAGE_EXPORT_BASELINE].sort().join("\0")) {
			violations.push(
				`packages/coding-agent/package.json: Legacy package exports changed without updating the retirement baseline (${actualExports.join(", ") || "none"})`,
			);
		}
		violations.push(...findCanonicalExecutableOwnershipViolations({ cliAppBin, codingAgentBin }));
	}

	return violations;
}

export function findCanonicalExecutableOwnershipViolations({ cliAppBin, codingAgentBin } = {}) {
	const violations = [];
	if (codingAgentBin !== undefined) {
		violations.push("packages/coding-agent/package.json: coding-agent must not publish executable bins");
	}
	if (cliAppBin?.["vetta-agent"] !== "dist/agent-cli.js") {
		violations.push("packages/cli-app/package.json: vetta-agent must resolve to dist/agent-cli.js");
	}
	return violations;
}

export function collectGreenfieldSharedCoreImports(files) {
	return files
		.filter((file) => isGreenfieldSource(file.path))
		.flatMap((file) =>
			collectModuleEdges(file.path, file.text)
				.filter((moduleEdge) => /(?:^|\/)core\//.test(moduleEdge.specifier))
				.map((moduleEdge) => `${file.path} -> ${moduleEdge.specifier}`),
		)
		.filter((value, index, values) => values.indexOf(value) === index)
		.sort();
}

function collectModuleEdges(path, text) {
	if (!path.includes("/src/") || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return [];
	const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
	const edges = [];
	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
			edges.push({
				path,
				specifier: statement.moduleSpecifier.text,
				names: collectImportNames(statement.importClause),
			});
		}
		if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
			edges.push({
				path,
				specifier: statement.moduleSpecifier.text,
				names: collectExportNames(statement.exportClause),
			});
		}
	}
	return edges;
}

function collectImportNames(clause) {
	if (!clause) return [];
	const names = [];
	if (clause.name) names.push("default");
	if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
		for (const element of clause.namedBindings.elements) names.push(element.propertyName?.text ?? element.name.text);
	}
	if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push("*");
	return names;
}

function collectExportNames(clause) {
	if (!clause) return ["*"];
	if (!ts.isNamedExports(clause)) return ["*"];
	return clause.elements.map((element) => element.propertyName?.text ?? element.name.text);
}

function classifyLegacyExecutionEdge(moduleEdge) {
	const kinds = new Set();
	for (const name of moduleEdge.names) {
		const kind = LEGACY_EXECUTION_SYMBOL_KINDS.get(name);
		if (kind) kinds.add(kind);
	}
	if (moduleEdge.specifier === "@vetta/coding-agent/legacy/cli") kinds.add("legacy-cli-entry");
	if (
		moduleEdge.specifier.endsWith("/legacy-session-backend.js") ||
		moduleEdge.specifier === "./legacy-session-backend.js"
	) {
		kinds.add("legacy-session-backend");
	}
	if (moduleEdge.specifier.includes("legacy-knowledge-processing-session")) {
		kinds.add("legacy-knowledge-execution");
	}
	if (
		moduleEdge.specifier.endsWith("/main.js") &&
		moduleEdge.path.startsWith("packages/coding-agent/src/") &&
		moduleEdge.names.some((name) =>
			["main", "createLegacyAgentBootstrap", "runLegacyAgentWithBootstrap"].includes(name),
		)
	) {
		kinds.add("legacy-cli-public");
	}
	if (
		moduleEdge.path === "packages/coding-agent/src/public-api/legacy-session.ts" &&
		moduleEdge.names.some((name) => name === "AgentSession" || name === "SessionManager")
	) {
		kinds.add("legacy-session-public");
	}
	return [...kinds];
}

function isGreenfieldSource(path) {
	return path.includes("/greenfield-") || path.includes("/greenfield/") || path.includes("/greenfield-runtime/");
}

function sameEdge(left, right) {
	return left.path === right.path && left.specifier === right.specifier && left.kind === right.kind;
}

function scriptKind(path) {
	if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function readProductionSources() {
	return ["packages/coding-agent/src", "packages/cli-app/src", "packages/desktop-app/src"]
		.flatMap((root) => walkFiles(join(repoRoot, root)))
		.map((filePath) => ({ path: rel(filePath), text: readText(filePath) }));
}

if (isDirectRun(import.meta.url)) {
	const files = readProductionSources();
	const codingAgentPackageJson = JSON.parse(readText(join(repoRoot, "packages/coding-agent/package.json")));
	const cliAppPackageJson = JSON.parse(readText(join(repoRoot, "packages/cli-app/package.json")));
	const violations = findLegacyExecutionRetirementViolations(files, {
		cliAppBin: cliAppPackageJson.bin,
		codingAgentBin: codingAgentPackageJson.bin,
		requireBaseline: true,
		packageExports: codingAgentPackageJson.exports,
	});
	if (violations.length > 0) {
		for (const violation of violations) fail(`[legacy-execution] ${violation}`);
	} else {
		const sharedCoreImports = collectGreenfieldSharedCoreImports(files);
		ok(
			`[legacy-execution] ok (${LEGACY_EXECUTION_EDGE_BASELINE.length} execution edge(s), ${RETAINED_LEGACY_FORMAT_BOUNDARIES.length} retained format boundary(s), ${sharedCoreImports.length} Greenfield shared-core import(s))`,
		);
	}
}
