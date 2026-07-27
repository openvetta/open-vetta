import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { capabilityDetailDocumentSchema } from "./document-schema";
import { capabilityDetailDocuments, getCapabilityDetailDocument } from "./documents";
import { registerCapabilityDetailI18n } from "./register-capability-detail-i18n";
import { resolveCapabilityDetailDocument } from "./resolve-capability-detail";

describe("capability detail documents", () => {
	it("loads every built-in document with a unique capability id", () => {
		expect(capabilityDetailDocuments).toHaveLength(3);
		expect(new Set(capabilityDetailDocuments.map((document) => document.capabilityId)).size).toBe(3);
		expect(getCapabilityDetailDocument("connector:figma")?.id).toBe("figma");
	});

	it("rejects missing localized messages and duplicate section ids", () => {
		const result = capabilityDetailDocumentSchema.safeParse({
			schemaVersion: 1,
			id: "invalid",
			capabilityId: "connector:invalid",
			sections: [
				{ id: "intro", type: "intro", bodyKey: "intro.body" },
				{ id: "intro", type: "featureList", itemsKey: "features.items" },
			],
			messages: {
				zh: { intro: { body: "介绍" }, features: { items: ["功能"] } },
				en: { intro: {}, features: { items: [] } },
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some((issue) => issue.message.includes("duplicate section id"))).toBe(true);
			expect(result.error.issues.some((issue) => issue.message.includes("message is missing"))).toBe(true);
		}
	});

	it("registers document messages with i18next and resolves sections", async () => {
		const instance = i18next.createInstance();
		await instance.init({
			lng: "zh",
			fallbackLng: "zh",
			ns: ["skills"],
			defaultNS: "skills",
			resources: { zh: { skills: {} }, en: { skills: {} } },
		});
		registerCapabilityDetailI18n(instance);
		const document = getCapabilityDetailDocument("connector:figma");
		expect(document).not.toBeNull();
		if (!document) return;

		const detail = resolveCapabilityDetailDocument(document, instance.getFixedT("zh", "skills"), {
			name: "Figma",
		});

		expect(detail.developer).toBe("Figma 官方");
		expect(detail.tags).toEqual(["设计", "协作", "效率"]);
		expect(detail.sections.map((section) => section.id)).toEqual([
			"introduction",
			"showcase",
			"features",
			"scenarios",
			"permissions",
			"reviews",
		]);
	});
});
