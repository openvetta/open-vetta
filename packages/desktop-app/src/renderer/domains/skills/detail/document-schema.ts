import { z } from "zod";

const messageKeySchema = z.string().trim().min(1);

const sectionBaseShape = {
	id: z.string().trim().min(1),
	titleKey: messageKeySchema.optional(),
};

const introSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("intro"),
		bodyKey: messageKeySchema,
	})
	.strict();

const chatOverCanvasSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("showcase"),
		template: z.literal("chat-over-canvas"),
		canvas: z.enum(["design", "code", "docs", "generic"]),
		userPromptKey: messageKeySchema,
		assistantReplyKey: messageKeySchema,
	})
	.strict();

const chatThreadSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("showcase"),
		template: z.literal("chat-thread"),
		userPromptKey: messageKeySchema,
		assistantReplyKey: messageKeySchema,
	})
	.strict();

const mediaSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("media"),
		kind: z.literal("image"),
		src: z
			.string()
			.trim()
			.refine(
				(value) => value.startsWith("https://") || value.startsWith("data:image/") || value.startsWith("/"),
				"image source must use https, data:image, or an app-relative path",
			),
		altKey: messageKeySchema.optional(),
	})
	.strict();

const featureListSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("featureList"),
		itemsKey: messageKeySchema,
	})
	.strict();

export const capabilityScenarioIconSchema = z.enum([
	"code",
	"collaboration",
	"design",
	"document",
	"folder",
	"issue",
	"knowledge",
	"notes",
	"review",
	"tasks",
	"generic",
]);

const scenariosSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("scenarios"),
		itemsKey: messageKeySchema,
		icons: z.array(capabilityScenarioIconSchema).optional(),
	})
	.strict();

const permissionsSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("permissions"),
		leadKey: messageKeySchema.optional(),
		itemsKey: messageKeySchema,
		showDetailLink: z.boolean().optional(),
	})
	.strict();

const reviewsSectionSchema = z
	.object({
		...sectionBaseShape,
		type: z.literal("reviews"),
		score: z.number().min(0).max(5).optional(),
		count: z.number().int().nonnegative().optional(),
		quotesKey: messageKeySchema,
	})
	.strict();

const capabilityDetailSectionDocumentSchema = z.union([
	introSectionSchema,
	chatOverCanvasSectionSchema,
	chatThreadSectionSchema,
	mediaSectionSchema,
	featureListSectionSchema,
	scenariosSectionSchema,
	permissionsSectionSchema,
	reviewsSectionSchema,
]);

const messageBundleSchema = z.record(z.string(), z.json());

function readMessage(bundle: Record<string, unknown>, key: string): unknown {
	let current: unknown = bundle;
	for (const segment of key.split(".")) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function collectMessageKeys(
	document: z.infer<typeof capabilityDetailDocumentBaseSchema>,
): Array<{ key: string; kind: "string" | "stringArray" }> {
	const keys: Array<{ key: string; kind: "string" | "stringArray" }> = [];
	if (document.header?.summaryKey) keys.push({ key: document.header.summaryKey, kind: "string" });
	if (document.header?.developerKey) keys.push({ key: document.header.developerKey, kind: "string" });
	if (document.header?.tagsKey) keys.push({ key: document.header.tagsKey, kind: "stringArray" });

	for (const section of document.sections) {
		if (section.titleKey) keys.push({ key: section.titleKey, kind: "string" });
		switch (section.type) {
			case "intro":
				keys.push({ key: section.bodyKey, kind: "string" });
				break;
			case "showcase":
				keys.push({ key: section.userPromptKey, kind: "string" });
				keys.push({ key: section.assistantReplyKey, kind: "string" });
				break;
			case "media":
				if (section.altKey) keys.push({ key: section.altKey, kind: "string" });
				break;
			case "featureList":
			case "scenarios":
			case "permissions":
				keys.push({ key: section.itemsKey, kind: "stringArray" });
				if (section.type === "permissions" && section.leadKey) {
					keys.push({ key: section.leadKey, kind: "string" });
				}
				break;
			case "reviews":
				keys.push({ key: section.quotesKey, kind: "stringArray" });
				break;
		}
	}
	return keys;
}

const capabilityDetailDocumentBaseSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
		capabilityId: z.string().trim().min(1),
		header: z
			.object({
				summaryKey: messageKeySchema.optional(),
				developerKey: messageKeySchema.optional(),
				tagsKey: messageKeySchema.optional(),
			})
			.strict()
			.optional(),
		sections: z.array(capabilityDetailSectionDocumentSchema).min(1),
		messages: z
			.object({
				zh: messageBundleSchema,
				en: messageBundleSchema,
			})
			.strict(),
	})
	.strict();

export const capabilityDetailDocumentSchema = capabilityDetailDocumentBaseSchema.superRefine((document, context) => {
	const sectionIds = new Set<string>();
	for (const [index, section] of document.sections.entries()) {
		if (sectionIds.has(section.id)) {
			context.addIssue({
				code: "custom",
				message: `duplicate section id: ${section.id}`,
				path: ["sections", index, "id"],
			});
		}
		sectionIds.add(section.id);
	}

	const messageKeys = collectMessageKeys(document);
	for (const language of ["zh", "en"] as const) {
		for (const { key, kind } of messageKeys) {
			const value = readMessage(document.messages[language], key);
			const valid =
				kind === "string"
					? typeof value === "string" && value.trim().length > 0
					: Array.isArray(value) &&
						value.length > 0 &&
						value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
			if (!valid) {
				context.addIssue({
					code: "custom",
					message: `${kind} message is missing: ${key}`,
					path: ["messages", language],
				});
			}
		}
	}
});

export type CapabilityDetailDocument = z.infer<typeof capabilityDetailDocumentSchema>;
export type CapabilityDetailSectionDocument = CapabilityDetailDocument["sections"][number];
export type CapabilityScenarioIcon = z.infer<typeof capabilityScenarioIconSchema>;
