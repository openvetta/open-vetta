import type { TFunction } from "i18next";
import type { CapabilityItem } from "../hooks/useCapabilitiesModel";
import { getCapabilityDetailDocument } from "./documents";
import { resolveCapabilityDetailDocument } from "./resolve-capability-detail";
import type {
	CapabilityDetailSection,
	CapabilityDetailStatus,
	CapabilityDetailViewModel,
	CapabilityPrimaryActionKind,
	CapabilitySecondaryActionKind,
} from "./types";

type SkillsTFunction = TFunction<"skills">;

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

function buildFallbackSections(item: CapabilityItem, t: SkillsTFunction): CapabilityDetailSection[] {
	const sections: CapabilityDetailSection[] = [];
	const body = item.description.trim();
	if (body) {
		sections.push({
			id: "introduction",
			type: "intro",
			title: t("capabilities.detail.section.intro"),
			body,
		});
	}

	if (item.driver === "connector" && (item.canConfigure || item.usesOAuth || item.setupRequired)) {
		sections.push({
			id: "permissions",
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
			id: "introduction",
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

function resolveFallbackDeveloper(item: CapabilityItem, t: SkillsTFunction): string | undefined {
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

function resolveFallbackTags(item: CapabilityItem): string[] {
	return item.driver === "skill" ? item.skill.tags.filter(Boolean) : [];
}

export function buildCapabilityDetailViewModel(item: CapabilityItem, t: SkillsTFunction): CapabilityDetailViewModel {
	const document = getCapabilityDetailDocument(item.id);
	const detail = document
		? resolveCapabilityDetailDocument(document, t, {
				iconUrl: resolveBrandIconUrl(item),
				name: item.title,
			})
		: null;
	const status = resolveStatus(item);
	const sections = detail?.sections.length ? detail.sections : buildFallbackSections(item, t);

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
		summary: detail?.summary ?? item.description,
		developer: detail?.developer ?? resolveFallbackDeveloper(item, t),
		tags: detail?.tags.length ? detail.tags : resolveFallbackTags(item),
		icon,
		status,
		primaryAction: resolvePrimaryAction(item, status),
		secondaryActions: resolveSecondaryActions(item, status),
		sections,
		busy: item.busy,
		canOpenPermissionDetails,
	};
}
