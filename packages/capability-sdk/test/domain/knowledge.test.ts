import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_KNOWLEDGE_CAPABILITIES } from "../../src/domain.js";

describe("knowledge domain capabilities", () => {
	it("uses one stable id per knowledge operation", () => {
		expect(Object.values(DOMAIN_KNOWLEDGE_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.file-status.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.status.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.rename`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.base.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.entry.add-files`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.entry.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.scan`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.retry-failed`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}knowledge.processing.settings.set`,
		]);
	});

	it("validates knowledge mutations and preserves explicit model clearing", () => {
		const update = DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.parseInput({
			data: {
				processingModelKey: null,
				processingModelReasoningLevel: null,
				agentConcurrency: 4,
			},
		});
		expect(update.data).toEqual({
			processingModelKey: null,
			processingModelReasoningLevel: null,
			agentConcurrency: 4,
		});
		expect(() =>
			DOMAIN_KNOWLEDGE_CAPABILITIES.ADD_FILES.parseInput({ kbId: "default_kb", paths: [], move: false }),
		).not.toThrow();
		expect(() =>
			DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.parseInput({ data: { agentConcurrency: 0 } }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
