import { describe, expect, it } from "vitest";
import type { CreateAgentSessionOptions } from "../../src/core/sdk.js";
import {
	assessSdkCreateOptionsCompatibility,
	SDK_CREATE_OPTION_COMPATIBILITY,
	SDK_CREATE_OPTION_WIRING,
	SDK_CREATE_RESULT_COMPATIBILITY,
	SDK_SESSION_MEMBER_COMPATIBILITY,
	SDK_SESSION_MEMBER_WIRING,
} from "../../src/public-api/sdk-compatibility-inventory.js";

describe("SDK compatibility inventory", () => {
	it("classifies every current factory option and result field", () => {
		expect(Object.keys(SDK_CREATE_OPTION_COMPATIBILITY)).toHaveLength(36);
		expect(SDK_CREATE_RESULT_COMPATIBILITY).toEqual({
			session: "greenfield-core",
			extensionsResult: "product-adapter",
			modelFallbackMessage: "product-adapter",
		});
		expect(SDK_CREATE_OPTION_COMPATIBILITY.resourceLoader).toBe("legacy-concrete");
		expect(SDK_CREATE_OPTION_COMPATIBILITY.sessionManager).toBe("legacy-concrete");
	});

	it("accepts product and Legacy fields closed by the SDK Host Adapter", () => {
		expect(
			assessSdkCreateOptionsCompatibility({
				cwd: "C:\\workspace",
				includeAgentSkills: false,
				enableMcp: false,
			}),
		).toEqual({ compatible: true, issues: [] });
		expect(SDK_CREATE_OPTION_WIRING.resourceLoader).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.sessionManager).toBe("wired");
		expect(assessSdkCreateOptionsCompatibility({ cwd: "C:\\workspace", thinkingLevel: "off" })).toEqual({
			compatible: true,
			issues: [],
		});
	});

	it("accepts wired tool, tracing and subagent injection options", () => {
		const subagentSessionFactory = {} as NonNullable<CreateAgentSessionOptions["subagentSessionFactory"]>;
		const subagentTypeRegistry = {} as NonNullable<CreateAgentSessionOptions["subagentTypeRegistry"]>;
		expect(assessSdkCreateOptionsCompatibility({ scopedModels: [], tools: [] })).toEqual({
			compatible: true,
			issues: [],
		});
		expect(assessSdkCreateOptionsCompatibility({ tracingTraceName: "sdk-trace" })).toEqual({
			compatible: true,
			issues: [],
		});
		expect(assessSdkCreateOptionsCompatibility({ subagentSessionFactory, subagentTypeRegistry })).toEqual({
			compatible: true,
			issues: [],
		});
	});

	it("tracks actual wiring independently from architectural disposition", () => {
		expect(Object.keys(SDK_SESSION_MEMBER_WIRING)).toHaveLength(Object.keys(SDK_SESSION_MEMBER_COMPATIBILITY).length);
		expect(SDK_CREATE_OPTION_WIRING.scopedModels).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.tools).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.customTools).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.tracer).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.tracingTraceName).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.tracingMetadata).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.subagentTypeRegistry).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.subagentSessionFactory).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.listSubagents).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.interruptSubagent).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.clearFinishedSubagents).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.cycleModel).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.reconfigureCustomTools).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.clearQueue).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.switchSession).toBe("wired");
		expect(SDK_SESSION_MEMBER_WIRING.agent).toBe("not-wired");
	});

	it("closes every Runtime capability member through fixed or active Session ports", () => {
		for (const [member, disposition] of Object.entries(SDK_SESSION_MEMBER_COMPATIBILITY)) {
			if (disposition !== "runtime-capability") continue;
			expect(SDK_SESSION_MEMBER_WIRING[member as keyof typeof SDK_SESSION_MEMBER_WIRING], member).toBe("wired");
		}
	});

	it("distinguishes the closed core facade from later capabilities and implementation leaks", () => {
		for (const member of [
			"prompt",
			"steer",
			"followUp",
			"abort",
			"subscribe",
			"close",
			"sessionId",
			"sessionFile",
			"state",
			"messages",
			"model",
			"thinkingLevel",
			"isStreaming",
			"setModel",
			"setThinkingLevel",
		] as const) {
			expect(SDK_SESSION_MEMBER_COMPATIBILITY[member]).toBe("greenfield-core");
		}
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.compact).toBe("runtime-capability");
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.bindExtensions).toBe("product-adapter");
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.agent).toBe("legacy-concrete");
	});
});
