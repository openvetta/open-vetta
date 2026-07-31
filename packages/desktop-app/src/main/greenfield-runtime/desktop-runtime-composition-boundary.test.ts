import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionSources = {
	composition: readSource("./desktop-runtime-composition.ts"),
	hostServices: readSource("./desktop-coding-agent-host-services.ts"),
	knowledgeFactory: readSource("../knowledge/processing-session-factory.ts"),
	legacyExecutionCompatibility: readSource("./desktop-legacy-execution-compatibility.ts"),
	legacyFormatCompatibility: readSource("./desktop-legacy-session-format-compatibility.ts"),
	poller: readSource("../knowledge/poller.ts"),
	runtimeEntry: readSource("../runtime.ts"),
};

describe("Desktop Runtime composition boundary", () => {
	it("keeps deprecated coding-agent subpaths out of the production composition", () => {
		for (const [name, source] of Object.entries(productionSources)) {
			expect(source, name).not.toContain("@vetta/coding-agent/legacy/");
		}
	});

	it("separates Legacy execution from session-format compatibility", () => {
		expect(productionSources.legacyExecutionCompatibility).toContain("LegacyCodingAgentSessionBackend");
		expect(productionSources.legacyExecutionCompatibility).not.toContain("LegacyRuntimeSessionCatalog");
		expect(productionSources.legacyExecutionCompatibility).not.toContain("LegacyRuntimeSessionFileHistoryReader");
		expect(productionSources.legacyFormatCompatibility).not.toContain("LegacyCodingAgentSessionBackend");
		expect(productionSources.legacyFormatCompatibility).toContain("LegacyRuntimeSessionCatalog");
		expect(productionSources.legacyFormatCompatibility).toContain("LegacyRuntimeSessionFileHistoryReader");
		expect(productionSources.composition).toContain("createDesktopLegacyExecutionCompatibility");
		expect(productionSources.composition).toContain("createDesktopLegacySessionFormatCompatibility");
		expect(productionSources.composition).toContain("ModelRegistryRuntimeSharedModelController");
	});

	it("keeps the Runtime entry limited to singleton lifecycle ownership", () => {
		expect(productionSources.runtimeEntry).toContain("createDesktopRuntimeComposition");
		expect(productionSources.runtimeEntry).not.toContain("CatalogRoutedRuntimeHostSessionBackend");
		expect(productionSources.runtimeEntry).not.toContain("DesktopGreenfieldRuntimeSessionCatalog");
	});
});

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
