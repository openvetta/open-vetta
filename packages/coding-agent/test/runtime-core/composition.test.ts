import { assessRuntimeHostSessionAssembly } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	createLegacyRuntimeHostOptions,
	createLegacyRuntimeHostSessionAssembly,
	LegacyCodingAgentSessionBackend,
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
} from "../../src/adapters/runtime-core/index.js";
import { createTestSession } from "../utilities.js";

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

	it("satisfies the same complete RuntimeHost assembly gate used by Greenfield candidates", async () => {
		const context = createTestSession({ inMemory: true });
		try {
			const assembly = createLegacyRuntimeHostSessionAssembly(context.session);
			const assessment = assessRuntimeHostSessionAssembly(assembly);

			expect(assessment.ready).toBe(true);
			if (!assessment.ready) throw new Error("Expected a complete Legacy RuntimeHost session assembly");
			await assessment.assembly.hostInteraction.bind({
				confirm: async () => true,
				requestSandboxGrant: async () => "allow_once",
			});
			assessment.assembly.configurationController.setSteeringMode("all");
			assessment.assembly.configurationController.setFollowUpMode("one-at-a-time");
			expect(context.session.steeringMode).toBe("all");
			expect(context.session.followUpMode).toBe("one-at-a-time");
			expect(assessment.assembly.workspaceView.readWorkingDirectory()).toEqual(expect.any(String));
			expect(assessment.assembly.historyReader.readHistory()).toEqual([]);
		} finally {
			context.cleanup();
		}
	});
});
