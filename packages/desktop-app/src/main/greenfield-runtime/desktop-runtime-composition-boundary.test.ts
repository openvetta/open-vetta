import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionSources = {
	composition: readSource("./desktop-runtime-composition.ts"),
	hostServices: readSource("./desktop-coding-agent-host-services.ts"),
	knowledgeFactory: readSource("../knowledge/processing-session-factory.ts"),
	legacyCompatibility: readSource("./desktop-legacy-runtime-compatibility.ts"),
	poller: readSource("../knowledge/poller.ts"),
	runtimeEntry: readSource("../runtime.ts"),
};

describe("Desktop Runtime composition boundary", () => {
	it("keeps deprecated coding-agent subpaths out of the production composition", () => {
		for (const [name, source] of Object.entries(productionSources)) {
			expect(source, name).not.toContain("@vetta/coding-agent/legacy/");
		}
	});

	it("limits Desktop Legacy compatibility to backend, catalog and history services", () => {
		expect(productionSources.legacyCompatibility).toContain("LegacyCodingAgentSessionBackend");
		expect(productionSources.legacyCompatibility).toContain("LegacyRuntimeSessionCatalog");
		expect(productionSources.legacyCompatibility).toContain("LegacyRuntimeSessionFileHistoryReader");
		expect(productionSources.legacyCompatibility).not.toContain("createLegacyRuntimeHostOptions");
		expect(productionSources.legacyCompatibility).not.toContain("sharedModelController");
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
