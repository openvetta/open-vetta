import type { TFunction } from "i18next";
import type { CapabilityItem } from "../hooks/useCapabilitiesModel";
import {
	CATALOG_SCENARIO_ICONS,
	CATALOG_SHOWCASE,
	type CapabilityCatalogId,
	resolveCapabilityCatalogId,
} from "./catalog";
import type {
	CapabilityDetailSection,
	CapabilityDetailStatus,
	CapabilityDetailViewModel,
	CapabilityPrimaryActionKind,
	CapabilitySecondaryActionKind,
} from "./types";

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function resolveBrandIconUrl(item: CapabilityItem): string | undefined {
	if (item.driver === "connector") return item.iconUrl;
	const icon = item.skill.icon?.trim();
	if (
		icon &&
		(icon.startsWith("http://") ||
			icon.startsWith("https://") ||
			icon.startsWith("data:") ||
			icon.startsWith("blob:") ||
			icon.startsWith("/"))
	) {
		return icon;
	}
	return undefined;
}

function buildCatalogSections(
	catalogId: CapabilityCatalogId,
	t: TFunction,
	item: CapabilityItem,
): CapabilityDetailSection[] {
	const base = `capabilities.detail.catalog.${catalogId}`;
	const sections: CapabilityDetailSection[] = [];

	const intro = t(`${base}.intro`, { defaultValue: "" });
	if (intro) {
		sections.push({
			type: "intro",
			title: t("capabilities.detail.section.intro"),
			body: intro,
		});
	}

	const userPrompt = t(`${base}.media.userPrompt`, { defaultValue: "" });
	const assistantReply = t(`${base}.media.assistantReply`, { defaultValue: "" });
	if (userPrompt && assistantReply) {
		const showcase = CATALOG_SHOWCASE[catalogId];
		const brandIconUrl = resolveBrandIconUrl(item);
		const brandName = item.title;
		if (showcase.template === "chat-over-canvas") {
			sections.push({
				type: "showcase",
				template: "chat-over-canvas",
				userPrompt,
				assistantReply,
				canvas: showcase.canvas,
				brandIconUrl,
				brandName,
			});
		} else {
			sections.push({
				type: "showcase",
				template: "chat-thread",
				userPrompt,
				assistantReply,
				brandIconUrl,
				brandName,
			});
		}
	}

	const features = readStringArray(t(`${base}.features`, { returnObjects: true, defaultValue: [] }));
	if (features.length > 0) {
		sections.push({
			type: "featureList",
			title: t("capabilities.detail.section.features"),
			items: features,
		});
	}

	const rawScenarios = t(`${base}.scenarios`, { returnObjects: true, defaultValue: [] });
	const scenarioIcons = CATALOG_SCENARIO_ICONS[catalogId];
	if (Array.isArray(rawScenarios) && rawScenarios.length > 0) {
		const items = rawScenarios
			.map((entry, index) => {
				// 兼容 string[] 或 { label }[]
				const label =
					typeof entry === "string"
						? entry
						: entry && typeof entry === "object" && typeof (entry as { label?: unknown }).label === "string"
							? (entry as { label: string }).label
							: "";
				if (!label) return null;
				return {
					icon: scenarioIcons[index] ?? "icon-[solar--widget-2-linear]",
					label,
				};
			})
			.filter((entry): entry is { icon: string; label: string } => entry !== null);
		if (items.length > 0) {
			sections.push({
				type: "scenarios",
				title: t("capabilities.detail.section.scenarios"),
				items,
			});
		}
	}

	const permLead = t(`${base}.permissions.lead`, { defaultValue: "" });
	const permItems = readStringArray(t(`${base}.permissions.items`, { returnObjects: true, defaultValue: [] }));
	if (permLead || permItems.length > 0) {
		sections.push({
			type: "permissions",
			title: t("capabilities.detail.section.permissions"),
			lead: permLead || undefined,
			items: permItems,
			showDetailLink: true,
		});
	}

	const scoreRaw = t(`${base}.reviews.score`, { defaultValue: "" });
	const countRaw = t(`${base}.reviews.count`, { defaultValue: "" });
	const quotes = readStringArray(t(`${base}.reviews.quotes`, { returnObjects: true, defaultValue: [] }));
	const score = Number(scoreRaw);
	const count = Number(countRaw);
	if (quotes.length > 0 || (Number.isFinite(score) && score > 0)) {
		sections.push({
			type: "reviews",
			title: t("capabilities.detail.section.reviews"),
			score: Number.isFinite(score) && score > 0 ? score : undefined,
			count: Number.isFinite(count) && count > 0 ? count : undefined,
			quotes,
		});
	}

	return sections;
}

function buildFallbackSections(item: CapabilityItem, t: TFunction): CapabilityDetailSection[] {
	const sections: CapabilityDetailSection[] = [];
	const body = item.description.trim();
	if (body) {
		sections.push({
			type: "intro",
			title: t("capabilities.detail.section.intro"),
			body,
		});
	}

	if (item.driver === "skill" && item.skill.tags.length > 0) {
		// tags 已在壳上展示；技能无更多 meta 时不重复
	}

	if (item.driver === "connector" && (item.canConfigure || item.usesOAuth || item.setupRequired)) {
		sections.push({
			type: "permissions",
			title: t("capabilities.detail.section.permissions"),
			lead: t("capabilities.detail.fallback.permissionsLead"),
			items: [
				item.usesOAuth
					? t("capabilities.detail.fallback.permissionOAuth")
					: t("capabilities.detail.fallback.permissionSecrets"),
			],
			showDetailLink: true,
		});
	}

	if (sections.length === 0) {
		sections.push({
			type: "intro",
			title: t("capabilities.detail.section.intro"),
			body: t("capabilities.detail.fallback.emptyBody"),
		});
	}

	return sections;
}

function resolveStatus(item: CapabilityItem): CapabilityDetailStatus {
	if (item.readonly) return "readonly";
	if (!item.installed) return "available";
	if (item.setupRequired) return "setup_required";
	if (!item.enabled) return "disabled";
	return "enabled";
}

function resolvePrimaryAction(item: CapabilityItem, status: CapabilityDetailStatus): CapabilityPrimaryActionKind {
	if (status === "readonly") return "none";
	if (item.needsUpdate && item.installed) return "update";
	if (status === "available") return "add";
	if (status === "setup_required") return "setup";
	if (status === "disabled") return "enable";
	return "none";
}

function resolveSecondaryActions(
	item: CapabilityItem,
	status: CapabilityDetailStatus,
): CapabilitySecondaryActionKind[] {
	if (status === "readonly" || status === "available") return [];
	const actions: CapabilitySecondaryActionKind[] = [];
	if (status === "enabled") actions.push("disable");
	if (item.driver === "connector" && (item.canConfigure || item.usesOAuth)) {
		actions.push("configure");
	}
	actions.push("remove");
	return actions;
}

function resolveDeveloper(
	item: CapabilityItem,
	catalogId: CapabilityCatalogId | null,
	t: TFunction,
): string | undefined {
	if (catalogId) {
		const fromCatalog = t(`capabilities.detail.catalog.${catalogId}.developer`, { defaultValue: "" });
		if (fromCatalog) return fromCatalog;
	}
	if (item.driver === "skill") {
		const author = item.skill.author?.trim();
		if (author) return author;
		if (item.skill.isCustom) return t("capabilities.detail.developer.local");
		if (item.skill.isAgent) return t("capabilities.detail.developer.agent");
		return t("capabilities.detail.developer.market");
	}
	if (item.preset) return t("capabilities.detail.developer.builtin");
	if (item.market) return t("capabilities.detail.developer.market");
	if (item.isCustom) return t("capabilities.detail.developer.local");
	return undefined;
}

function resolveTags(item: CapabilityItem, catalogId: CapabilityCatalogId | null, t: TFunction): string[] {
	if (catalogId) {
		const tags = readStringArray(
			t(`capabilities.detail.catalog.${catalogId}.tags`, { returnObjects: true, defaultValue: [] }),
		);
		if (tags.length > 0) return tags;
	}
	if (item.driver === "skill") return item.skill.tags.filter(Boolean);
	return [];
}

export function buildCapabilityDetailViewModel(item: CapabilityItem, t: TFunction): CapabilityDetailViewModel {
	const catalogId = resolveCapabilityCatalogId(item.id);
	const status = resolveStatus(item);
	const sections = catalogId !== null ? buildCatalogSections(catalogId, t, item) : buildFallbackSections(item, t);

	// catalog 生成失败时兜底
	const resolvedSections = sections.length > 0 ? sections : buildFallbackSections(item, t);

	const icon: CapabilityDetailViewModel["icon"] =
		item.driver === "skill"
			? {
					kind: "skill",
					skillType: item.skill.type,
					icon: item.skill.icon,
				}
			: { kind: "image", url: item.iconUrl };

	const canOpenPermissionDetails =
		item.driver === "connector" &&
		(item.setupRequired || item.canConfigure || item.usesOAuth || Boolean(item.preset?.secrets?.length));

	return {
		id: item.id,
		title: item.title,
		summary: item.description,
		developer: resolveDeveloper(item, catalogId, t),
		tags: resolveTags(item, catalogId, t),
		icon,
		status,
		primaryAction: resolvePrimaryAction(item, status),
		secondaryActions: resolveSecondaryActions(item, status),
		sections: resolvedSections,
		busy: item.busy,
		canOpenPermissionDetails,
	};
}
