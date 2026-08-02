/**
 * Enforce monorepo dependency direction (apps may depend on libs; libs must not
 * depend on apps / host packages).
 *
 * Rules (see README "依赖方向"):
 * - Core/runtime/libs must not import desktop-app, admin, site, cli-app
 * - plugins/** must not deep-import desktop-app internals
 * - packages must not import another package's test/ tree
 * - runtime-core production code must not import coding-agent adapters
 *
 * Usage:
 *   bun run scripts/quality/check-package-boundaries.mjs
 */

import { join } from "node:path";
import ts from "typescript";
import { fail, isDirectRun, ok, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

/** Path prefixes (posix, under repo root) that must stay host-agnostic. */
const LIB_PREFIXES = [
	"packages/capability-sdk/",
	"packages/capability-runtime/",
	"packages/ai/",
	"packages/agent/",
	"packages/coding-agent/",
	"packages/ecosystem-adapter/",
	"packages/runtime-core/",
	"packages/runtime-tools/",
	"packages/runtime-storage/",
	"packages/runtime-mcp/",
	"packages/runtime-telemetry/",
	"packages/runtime-composition/",
	"packages/action-rpc/",
	"packages/toolkit/",
	"packages/theme-sdk/",
	"packages/theme-ui/",
	"packages/markdown/",
	"packages/ui/",
	"packages/plugins/plugin-sdk/",
	"packages/plugins/plugin-vite/",
];

const MANIFEST_TRUTH_PACKAGE_NAMES = new Set([
	"@vetta/coding-agent",
	"@vetta/runtime-composition",
	"@vetta/runtime-storage",
	"@vetta/runtime-tools",
	"@vetta/cli-app",
	"@vetta/desktop-app",
]);

function isLibFile(posixPath) {
	return LIB_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

function isPluginPackageFile(posixPath) {
	return posixPath.startsWith("packages/plugins/presets/") || posixPath.startsWith("packages/plugins/externals/");
}

function scriptKind(filePath) {
	if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.TS;
}

export function collectImportSpecifiers(filePath, text) {
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(filePath));
	const specifiers = [];
	const add = (node) => {
		if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
	};
	const visit = (node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			add(node.moduleSpecifier);
		} else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
			add(node.moduleReference.expression);
		} else if (ts.isCallExpression(node) && node.arguments.length === 1) {
			const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
			const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
			if (isDynamicImport || isRequire) add(node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return specifiers;
}

function collectCapabilityIdLiterals(filePath, text) {
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(filePath));
	const capabilityIds = [];
	const visit = (node) => {
		if (ts.isStringLiteralLike(node) && /^cap\.(?:foundation|domain)\./.test(node.text)) {
			capabilityIds.push(node.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return capabilityIds;
}

function usesDesktopPluginGlobal(filePath, text) {
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(filePath));
	let found = false;
	const visit = (node) => {
		if (
			ts.isPropertyAccessExpression(node) &&
			node.name.text === "vetta" &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "window"
		) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
}

function forbiddenAppId(specifier) {
	const normalized = specifier.replaceAll("\\", "/");
	for (const packageName of ["@vetta/desktop-app", "@vetta/cli-app", "@vetta/site", "shadcn-admin"]) {
		if (normalized === packageName || normalized.startsWith(`${packageName}/`)) return packageName;
	}
	const match = normalized.match(/(?:^|\/)(desktop-app|cli-app|admin|site)(?:\/|$)/);
	return match?.[1] ? `${match[1]} path` : null;
}

function checkForbiddenAppImports(posixPath, specifiers, findings) {
	if (!isLibFile(posixPath) && !isPluginPackageFile(posixPath)) return;
	for (const specifier of specifiers) {
		const id = forbiddenAppId(specifier);
		if (id) findings.push(`${posixPath}: libs/plugins must not import app package (${id})`);
	}
}

function checkTestTreeImports(posixPath, specifiers, findings) {
	const isTestFile = posixPath.includes("/test/") || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(posixPath);
	if (isTestFile) return;
	for (const specifier of specifiers) {
		const normalized = specifier.replaceAll("\\", "/");
		if (/(?:^|\/)test(?:\/|$)/.test(normalized)) {
			findings.push(`${posixPath}: production code must not import test trees (${specifier})`);
		}
	}
}

function checkPluginDesktopDeepImport(posixPath, specifiers, findings) {
	if (!isPluginPackageFile(posixPath)) return;
	if (specifiers.some((specifier) => specifier.includes("desktop-app/src/") || specifier.startsWith("@/main/"))) {
		findings.push(`${posixPath}: plugins must not deep-import desktop-app internals`);
	}
}

function checkDesktopCliSourceImports(posixPath, specifiers, findings) {
	if (!posixPath.startsWith("packages/desktop-app/src/")) return;
	for (const specifier of specifiers) {
		const normalized = specifier.replaceAll("\\", "/");
		if (normalized.includes("cli-app/src/")) {
			findings.push(`${posixPath}: desktop-app must consume cli-app through a package export (${specifier})`);
		}
	}
}

function checkPluginDesktopGlobal(posixPath, text, findings) {
	if (!isPluginPackageFile(posixPath) || posixPath.endsWith(".d.ts")) return;
	if (posixPath.startsWith("packages/plugins/presets/plugin-workbench/")) return;
	if (usesDesktopPluginGlobal(posixPath, text)) {
		findings.push(`${posixPath}: plugins must use the public plugin SDK instead of window.vetta`);
	}
}

function checkCapabilityLayerImports(posixPath, specifiers, findings) {
	const isCapabilitySdk = posixPath.startsWith("packages/capability-sdk/");
	const isCapabilityRuntime = posixPath.startsWith("packages/capability-runtime/");
	if (!isCapabilitySdk && !isCapabilityRuntime) return;

	const forbiddenPrefixes = [
		"@vetta-org/plugin-sdk",
		"@vetta/action-rpc",
		"@vetta/desktop-app",
		"@vetta/theme-sdk",
		"@vetta/theme-ui",
	];
	if (isCapabilitySdk) forbiddenPrefixes.push("@vetta/capability-runtime");
	for (const specifier of specifiers) {
		if (forbiddenPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
			findings.push(
				`${posixPath}: capability internals must not import public system SDKs or app packages (${specifier})`,
			);
		}
	}
}

function checkPublicSystemSdkImports(posixPath, specifiers, findings) {
	const isPublicSystemSdk =
		posixPath.startsWith("packages/theme-sdk/") || posixPath.startsWith("packages/plugins/plugin-sdk/");
	if (!isPublicSystemSdk) return;
	for (const specifier of specifiers) {
		if (specifier.startsWith("@vetta/capability-sdk/internal/")) {
			findings.push(`${posixPath}: public system SDKs must not expose built-in capability adapters (${specifier})`);
		}
	}
}

function checkRawCapabilityIds(posixPath, text, findings) {
	const isCapabilityDefinition =
		posixPath === "packages/capability-sdk/src/contracts.ts" ||
		posixPath.startsWith("packages/capability-sdk/src/domain/") ||
		posixPath.startsWith("packages/capability-sdk/src/foundation/");
	if (isCapabilityDefinition) return;
	for (const capabilityId of collectCapabilityIdLiterals(posixPath, text)) {
		findings.push(`${posixPath}: import a capability token instead of using raw id ${capabilityId}`);
	}
}

function checkCapabilitySchemaDefinitions(posixPath, text, findings) {
	const isCapabilityDefinition =
		posixPath.startsWith("packages/capability-sdk/src/domain/") ||
		posixPath.startsWith("packages/capability-sdk/src/foundation/");
	if (!isCapabilityDefinition || !text.includes("defineCapability<")) return;
	if (/\bparse(?:Input|Output)\s*:/.test(text)) {
		findings.push(`${posixPath}: capability tokens must use schema-backed input and output definitions`);
	}
	if (!text.includes("createCapabilityCatalog")) {
		findings.push(`${posixPath}: capability definition files must publish a generated catalog`);
	}
}

function checkGreenfieldRuntimeImports(posixPath, specifiers, findings) {
	const isGreenfieldRuntime =
		posixPath.startsWith("packages/runtime-storage/src/conversation/") ||
		posixPath.startsWith("packages/runtime-tools/src/coding/") ||
		posixPath.startsWith("packages/runtime-mcp/src/");
	if (!isGreenfieldRuntime) return;
	for (const specifier of specifiers) {
		if (specifier === "@vetta/coding-agent" || specifier.startsWith("@vetta/coding-agent/")) {
			findings.push(`${posixPath}: greenfield runtime modules must not import coding-agent (${specifier})`);
		}
	}
}

function checkGreenfieldLegacyStartupSymbols(posixPath, text, findings) {
	const isGreenfieldProductModule =
		posixPath.startsWith("packages/cli-app/src/rpc/greenfield") ||
		posixPath.startsWith("packages/coding-agent/src/composition/") ||
		posixPath.startsWith("packages/runtime-composition/src/");
	if (!isGreenfieldProductModule) return;

	const sourceFile = ts.createSourceFile(posixPath, text, ts.ScriptTarget.Latest, true, scriptKind(posixPath));
	const forbiddenSymbols = new Set(["createLegacyAgentBootstrap", "runLegacyAgentWithBootstrap"]);
	const usedSymbols = new Set();
	const visit = (node) => {
		if (ts.isIdentifier(node) && forbiddenSymbols.has(node.text)) {
			usedSymbols.add(node.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	for (const symbol of usedSymbols) {
		findings.push(`${posixPath}: greenfield product modules must not use legacy startup symbol ${symbol}`);
	}
}

function checkRuntimeCompositionCompatibilityFacade(posixPath, specifiers, findings) {
	if (!posixPath.startsWith("packages/runtime-composition/src/")) return;
	if (
		posixPath !== "packages/runtime-composition/src/index.ts" &&
		posixPath !== "packages/runtime-composition/src/artifact-manifest.ts"
	) {
		findings.push(`${posixPath}: runtime-composition is a compatibility facade and must not own implementations`);
		return;
	}
	if (posixPath !== "packages/runtime-composition/src/index.ts") return;
	for (const specifier of specifiers) {
		if (specifier === "@vetta/coding-agent/composition" || specifier === "./artifact-manifest.js") continue;
		findings.push(`${posixPath}: runtime-composition may only forward coding-agent composition (${specifier})`);
	}
}

function checkCodingAgentRootImports(posixPath, specifiers, findings) {
	const isInternalConsumer = posixPath.startsWith("packages/") && !posixPath.startsWith("packages/coding-agent/");
	const hasStricterProductionBoundary =
		posixPath.startsWith("packages/agent/src/") ||
		posixPath.startsWith("packages/runtime-core/src/") ||
		posixPath.startsWith("packages/runtime-storage/src/conversation/") ||
		posixPath.startsWith("packages/runtime-tools/src/coding/") ||
		posixPath.startsWith("packages/runtime-mcp/src/");
	if (!isInternalConsumer || hasStricterProductionBoundary) return;
	if (specifiers.includes("@vetta/coding-agent")) {
		findings.push(
			`${posixPath}: internal consumers must use an explicit @vetta/coding-agent subpath instead of the compatibility root`,
		);
	}
}

function checkCodingAgentLegacyBoundaries(posixPath, text, specifiers, findings) {
	const isProductionSource = posixPath.includes("/src/") && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(posixPath);
	if (!isProductionSource) return;

	for (const specifier of specifiers) {
		if (!specifier.startsWith("@vetta/coding-agent/legacy/")) continue;
		const isAllowedCliEntry =
			posixPath === "packages/cli-app/src/legacy-runtime-gateway.ts" &&
			specifier === "@vetta/coding-agent/legacy/cli";
		if (!isAllowedCliEntry) {
			findings.push(`${posixPath}: production Legacy subpath import is outside the compatibility allowlist`);
		}
	}

	const sourceFile = ts.createSourceFile(posixPath, text, ts.ScriptTarget.Latest, true, scriptKind(posixPath));
	const usedSymbols = new Set();
	const visit = (node) => {
		if (ts.isIdentifier(node)) usedSymbols.add(node.text);
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	if (
		posixPath.startsWith("packages/cli-app/src/") &&
		posixPath !== "packages/cli-app/src/legacy-runtime-gateway.ts" &&
		!posixPath.startsWith("packages/cli-app/src/rpc/greenfield")
	) {
		for (const symbol of ["runLegacyAgent", "runLegacyAgentWithBootstrap"]) {
			if (usedSymbols.has(symbol)) {
				findings.push(`${posixPath}: Legacy startup symbol ${symbol} is outside the execution gateway`);
			}
		}
	}

	const isLegacyFormatModule = posixPath.startsWith(
		"packages/coding-agent/src/adapters/runtime-core/legacy-session-format/",
	);
	if (isLegacyFormatModule) {
		const forbiddenImportFragments = ["agent-session", "/sdk", "legacy-session-backend"];
		for (const specifier of specifiers) {
			if (forbiddenImportFragments.some((fragment) => specifier.includes(fragment))) {
				findings.push(`${posixPath}: Legacy session-format modules must not import execution code (${specifier})`);
			}
		}
		for (const symbol of ["AgentSession", "createAgentSession", "LegacyCodingAgentSessionBackend", "ModelRegistry"]) {
			if (usedSymbols.has(symbol)) {
				findings.push(`${posixPath}: Legacy session-format modules must not use execution symbol ${symbol}`);
			}
		}
	}

	const isCodingAgentAdapter = posixPath.startsWith("packages/coding-agent/src/adapters/runtime-core/");
	if (isCodingAgentAdapter) return;

	const desktopExecutionCompatibility =
		"packages/desktop-app/src/main/greenfield-runtime/desktop-legacy-execution-compatibility.ts";
	const desktopFormatCompatibility =
		"packages/desktop-app/src/main/greenfield-runtime/desktop-legacy-session-format-compatibility.ts";
	const cliFormatCompatibility = "packages/cli-app/src/rpc/cli-session-format-compatibility.ts";
	const protectedSymbols = new Set([
		"createLegacyRuntimeHostOptions",
		"LegacyCodingAgentSessionBackend",
		"LegacyRuntimeSessionCatalog",
		"LegacyRuntimeSessionFileHistoryReader",
		"LegacyRuntimeSharedModelController",
	]);
	for (const symbol of usedSymbols) {
		if (!protectedSymbols.has(symbol)) continue;
		const isAllowedDesktopExecution =
			symbol === "LegacyCodingAgentSessionBackend" && posixPath === desktopExecutionCompatibility;
		const isAllowedDesktopFormat =
			(symbol === "LegacyRuntimeSessionCatalog" || symbol === "LegacyRuntimeSessionFileHistoryReader") &&
			posixPath === desktopFormatCompatibility;
		const isAllowedCliFormat = symbol === "LegacyRuntimeSessionCatalog" && posixPath === cliFormatCompatibility;
		if (isAllowedDesktopExecution || isAllowedDesktopFormat || isAllowedCliFormat) continue;
		findings.push(`${posixPath}: Legacy Runtime adapter ${symbol} is outside the compatibility allowlist`);
	}
}

function workspacePackageName(specifier) {
	if (!specifier.startsWith("@vetta/") && !specifier.startsWith("@vetta-org/")) return undefined;
	return specifier.split("/").slice(0, 2).join("/");
}

function checkWorkspaceManifestImports(posixPath, specifiers, manifest, findings) {
	if (!manifest || !MANIFEST_TRUTH_PACKAGE_NAMES.has(manifest.name) || !posixPath.includes("/src/")) return;
	const declared = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
	]);
	for (const specifier of specifiers) {
		const packageName = workspacePackageName(specifier);
		if (!packageName || packageName === manifest.name || declared.has(packageName)) continue;
		findings.push(`${posixPath}: workspace import ${packageName} is not declared by ${manifest.name}`);
	}
}

function checkRuntimeCoreImports(posixPath, specifiers, findings) {
	if (!posixPath.startsWith("packages/runtime-core/src/")) return;
	for (const specifier of specifiers) {
		if (specifier === "@vetta/coding-agent" || specifier.startsWith("@vetta/coding-agent/")) {
			findings.push(`${posixPath}: runtime-core production code must not import coding-agent (${specifier})`);
		}
	}
}

function checkAgentCoreImports(posixPath, specifiers, findings) {
	if (!posixPath.startsWith("packages/agent/src/")) return;
	for (const specifier of specifiers) {
		const importsRuntimeCore = specifier === "@vetta/runtime-core" || specifier.startsWith("@vetta/runtime-core/");
		const importsCodingAgent = specifier === "@vetta/coding-agent" || specifier.startsWith("@vetta/coding-agent/");
		if (importsRuntimeCore || importsCodingAgent) {
			findings.push(`${posixPath}: agent-core must not import runtime or product packages (${specifier})`);
		}
	}
}

export function findPackageBoundaryViolations(posixPath, text, options = {}) {
	const findings = [];
	const specifiers = collectImportSpecifiers(posixPath, text);
	checkForbiddenAppImports(posixPath, specifiers, findings);
	checkTestTreeImports(posixPath, specifiers, findings);
	checkPluginDesktopDeepImport(posixPath, specifiers, findings);
	checkDesktopCliSourceImports(posixPath, specifiers, findings);
	checkPluginDesktopGlobal(posixPath, text, findings);
	checkCapabilityLayerImports(posixPath, specifiers, findings);
	checkPublicSystemSdkImports(posixPath, specifiers, findings);
	checkRawCapabilityIds(posixPath, text, findings);
	checkCapabilitySchemaDefinitions(posixPath, text, findings);
	checkGreenfieldRuntimeImports(posixPath, specifiers, findings);
	checkGreenfieldLegacyStartupSymbols(posixPath, text, findings);
	checkRuntimeCompositionCompatibilityFacade(posixPath, specifiers, findings);
	checkCodingAgentRootImports(posixPath, specifiers, findings);
	checkCodingAgentLegacyBoundaries(posixPath, text, specifiers, findings);
	checkWorkspaceManifestImports(posixPath, specifiers, options.manifest, findings);
	checkRuntimeCoreImports(posixPath, specifiers, findings);
	checkAgentCoreImports(posixPath, specifiers, findings);
	return findings;
}

const roots = [
	join(repoRoot, "packages/capability-sdk"),
	join(repoRoot, "packages/capability-runtime"),
	join(repoRoot, "packages/ai"),
	join(repoRoot, "packages/agent"),
	join(repoRoot, "packages/coding-agent"),
	join(repoRoot, "packages/ecosystem-adapter"),
	join(repoRoot, "packages/runtime-core"),
	join(repoRoot, "packages/runtime-tools"),
	join(repoRoot, "packages/runtime-storage"),
	join(repoRoot, "packages/runtime-mcp"),
	join(repoRoot, "packages/runtime-telemetry"),
	join(repoRoot, "packages/runtime-composition"),
	join(repoRoot, "packages/action-rpc"),
	join(repoRoot, "packages/toolkit"),
	join(repoRoot, "packages/theme-sdk"),
	join(repoRoot, "packages/theme-ui"),
	join(repoRoot, "packages/markdown"),
	join(repoRoot, "packages/ui"),
	join(repoRoot, "packages/plugins"),
	join(repoRoot, "packages/themes"),
	join(repoRoot, "packages/cli-app"),
	join(repoRoot, "packages/desktop-app"),
];

export function main() {
	const findings = [];
	let scanned = 0;

	for (const root of roots) {
		let manifest;
		try {
			manifest = JSON.parse(readText(join(root, "package.json")));
		} catch {
			manifest = undefined;
		}
		for (const file of walkFiles(root)) {
			const posixPath = rel(file);
			if (posixPath.includes("/node_modules/") || posixPath.includes("/dist/")) continue;
			// examples under coding-agent may intentionally wire hosts; skip demos
			if (posixPath.includes("/examples/")) continue;
			let text;
			try {
				text = readText(file);
			} catch {
				continue;
			}
			scanned += 1;
			findings.push(...findPackageBoundaryViolations(posixPath, text, { manifest }));
		}
	}

	if (findings.length === 0) {
		ok(`[package-boundaries] ok (${scanned} file(s) scanned)`);
		return 0;
	}

	for (const line of findings) {
		fail(`[package-boundaries] ${line}`);
	}
	fail(`[package-boundaries] ${findings.length} violation(s)`);
	return 1;
}

if (isDirectRun(import.meta.url)) {
	process.exit(main());
}
