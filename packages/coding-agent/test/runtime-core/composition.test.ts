import { describe, expect, it } from "vitest";
import {
	createLegacyRuntimeHostOptions,
	LegacyCodingAgentSessionBackend,
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
} from "../../src/adapters/runtime-core/index.js";

describe("legacy RuntimeHost composition", () => {
	it("assembles every coding-agent compatibility dependency explicitly", () => {
		const options = createLegacyRuntimeHostOptions({
			serverUrl: "https://example.test",
			getDefaultExecutionMode: () => "full-access",
		});

		expect(options.sessionBackend).toBeInstanceOf(LegacyCodingAgentSessionBackend);
		expect(options.sessionCatalog).toBeInstanceOf(LegacyRuntimeSessionCatalog);
		expect(options.sessionFileHistoryReader).toBeInstanceOf(LegacyRuntimeSessionFileHistoryReader);
		expect(options.sharedModelController).toBeUndefined();
		expect(options.serverUrl).toBe("https://example.test");
		expect(options.getDefaultExecutionMode?.()).toBe("full-access");
	});
});
