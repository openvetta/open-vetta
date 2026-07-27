import type { TFunction } from "i18next";
import type {
	CapabilityDetailDocument,
	CapabilityDetailSectionDocument,
	CapabilityScenarioIcon,
} from "./document-schema";
import type { CapabilityDetailSection } from "./types";

type SkillsTFunction = TFunction<"skills">;

const SCENARIO_ICON_CLASSES: Record<CapabilityScenarioIcon, string> = {
	code: "icon-[solar--code-linear]",
	collaboration: "icon-[solar--users-group-rounded-linear]",
	design: "icon-[solar--ruler-pen-linear]",
	document: "icon-[solar--document-text-linear]",
	folder: "icon-[solar--folder-with-files-linear]",
	issue: "icon-[solar--bug-linear]",
	knowledge: "icon-[solar--notebook-linear]",
	notes: "icon-[solar--notes-linear]",
	review: "icon-[solar--chat-round-line-linear]",
	tasks: "icon-[solar--checklist-linear]",
	generic: "icon-[solar--widget-2-linear]",
};

export interface CapabilityDetailBrand {
	iconUrl?: string;
	name: string;
}

export interface ResolvedCapabilityDetailDocument {
	summary?: string;
	developer?: string;
	tags: string[];
	sections: CapabilityDetailSection[];
}

function messageKey(document: CapabilityDetailDocument, key: string): string {
	return `capabilities.detail.documents.${document.id}.${key}`;
}

function resolveString(
	document: CapabilityDetailDocument,
	key: string | undefined,
	t: SkillsTFunction,
): string | undefined {
	if (!key) return undefined;
	const value = t(messageKey(document, key), { defaultValue: "" });
	return value || undefined;
}

function resolveStringArray(document: CapabilityDetailDocument, key: string, t: SkillsTFunction): string[] {
	const value = t(messageKey(document, key), { returnObjects: true, defaultValue: "" });
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function resolveSection(
	document: CapabilityDetailDocument,
	section: CapabilityDetailSectionDocument,
	t: SkillsTFunction,
	brand: CapabilityDetailBrand,
): CapabilityDetailSection {
	const title = resolveString(document, section.titleKey, t);
	switch (section.type) {
		case "intro":
			return {
				id: section.id,
				type: "intro",
				title,
				body: resolveString(document, section.bodyKey, t) ?? "",
			};
		case "showcase": {
			const common = {
				id: section.id,
				type: "showcase" as const,
				userPrompt: resolveString(document, section.userPromptKey, t) ?? "",
				assistantReply: resolveString(document, section.assistantReplyKey, t) ?? "",
				brandIconUrl: brand.iconUrl,
				brandName: brand.name,
			};
			return section.template === "chat-over-canvas"
				? { ...common, template: "chat-over-canvas", canvas: section.canvas }
				: { ...common, template: "chat-thread" };
		}
		case "media":
			return {
				id: section.id,
				type: "media",
				title,
				kind: "image",
				src: section.src,
				alt: resolveString(document, section.altKey, t),
			};
		case "featureList":
			return {
				id: section.id,
				type: "featureList",
				title,
				items: resolveStringArray(document, section.itemsKey, t),
			};
		case "scenarios": {
			const labels = resolveStringArray(document, section.itemsKey, t);
			return {
				id: section.id,
				type: "scenarios",
				title,
				items: labels.map((label, index) => ({
					icon: SCENARIO_ICON_CLASSES[section.icons?.[index] ?? "generic"],
					label,
				})),
			};
		}
		case "permissions":
			return {
				id: section.id,
				type: "permissions",
				title,
				lead: resolveString(document, section.leadKey, t),
				items: resolveStringArray(document, section.itemsKey, t),
				showDetailLink: section.showDetailLink,
			};
		case "reviews":
			return {
				id: section.id,
				type: "reviews",
				title,
				score: section.score,
				count: section.count,
				quotes: resolveStringArray(document, section.quotesKey, t),
			};
	}
}

export function resolveCapabilityDetailDocument(
	document: CapabilityDetailDocument,
	t: SkillsTFunction,
	brand: CapabilityDetailBrand,
): ResolvedCapabilityDetailDocument {
	return {
		summary: resolveString(document, document.header?.summaryKey, t),
		developer: resolveString(document, document.header?.developerKey, t),
		tags: document.header?.tagsKey ? resolveStringArray(document, document.header.tagsKey, t) : [],
		sections: document.sections.map((section) => resolveSection(document, section, t, brand)),
	};
}
