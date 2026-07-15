import type { MarketMcpServer } from "@shared/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type McpSettingsModel, useMcpSettingsModel } from "../../settings/components/useMcpSettingsModel";
import { useRemoteMcpSectionModel } from "../../settings/components/useRemoteMcpSectionModel";
import {
	type BuiltinMcpPreset,
	builtinMcpIconUrl,
	getListedBuiltinMcpPresets,
	isBuiltinMcpServer,
	matchBuiltinMcpPreset,
	missingRequiredSecrets,
	resolveMcpIcon,
	serverUsesOAuth,
} from "../../settings/mcp/builtin-mcp-presets";
import type { ActionState, MergedSkill } from "./useSkillsPageModel";

export type CapabilityScope = "discover" | "mine";

interface CapabilityBase {
	id: string;
	title: string;
	description: string;
	iconUrl?: string;
	installed: boolean;
	enabled: boolean;
	readonly: boolean;
	needsUpdate: boolean;
	setupRequired: boolean;
	authorized: boolean;
	busy: boolean;
	downloadCount: number;
	isCustom: boolean;
	searchTerms: string[];
}

export interface SkillCapability extends CapabilityBase {
	driver: "skill";
	skill: MergedSkill;
}

export interface ConnectorCapability extends CapabilityBase {
	driver: "connector";
	name: string;
	preset?: BuiltinMcpPreset;
	market?: MarketMcpServer;
	usesOAuth: boolean;
	canConfigure: boolean;
	canEdit: boolean;
}

export type CapabilityItem = SkillCapability | ConnectorCapability;

export interface CapabilitiesModel {
	scope: CapabilityScope;
	setScope: (scope: CapabilityScope) => void;
	items: CapabilityItem[];
	loading: boolean;
	refreshing: boolean;
	errors: string[];
	mcp: McpSettingsModel;
	add: (item: CapabilityItem) => void;
	remove: (item: CapabilityItem) => void;
	toggle: (item: CapabilityItem) => void;
	setup: (item: ConnectorCapability) => void;
	configure: (item: ConnectorCapability) => void;
	edit: (item: ConnectorCapability) => void;
	revokeAuthorization: (item: ConnectorCapability) => void;
	preview: (item: SkillCapability) => void;
	refresh: () => void;
}

interface UseCapabilitiesModelOptions {
	skills: MergedSkill[];
	searchQuery: string;
	skillLoading: boolean;
	skillError: string | null;
	actionStates: Record<string, ActionState>;
	sectionId?: string;
	onInstallSkill: (skill: MergedSkill) => void;
	onToggleSkill: (name: string) => void;
	onUninstallSkill: (name: string, type: "skill" | "scene") => void;
	onPreviewSkill: (skill: MergedSkill) => void;
	onRefreshSkills: () => void;
}

function toSkillCapability(skill: MergedSkill, actionStates: Record<string, ActionState>): SkillCapability {
	return {
		driver: "skill",
		id: `skill:${skill.name}`,
		title: skill.alias || skill.name,
		description: skill.description,
		installed: skill.installed,
		enabled: skill.enabled,
		readonly: Boolean(skill.isAgent),
		needsUpdate: skill.needsUpdate,
		setupRequired: false,
		authorized: false,
		busy: actionStates[skill.name] === "loading",
		downloadCount: skill.downloadCount,
		isCustom: Boolean(skill.isCustom),
		searchTerms: [skill.name, skill.alias, skill.description, ...skill.tags],
		skill,
	};
}

function filterCapabilities(items: CapabilityItem[], query: string): CapabilityItem[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return items;
	return items.filter((item) => item.searchTerms.some((term) => term.toLowerCase().includes(normalized)));
}

function sortCapabilities(items: CapabilityItem[], scope: CapabilityScope): CapabilityItem[] {
	return [...items].sort((a, b) => {
		if (scope === "mine" && a.setupRequired !== b.setupRequired) return a.setupRequired ? -1 : 1;
		if (a.installed !== b.installed) return a.installed ? -1 : 1;
		if (a.needsUpdate !== b.needsUpdate) return a.needsUpdate ? -1 : 1;
		if (a.downloadCount !== b.downloadCount) return b.downloadCount - a.downloadCount;
		return a.title.localeCompare(b.title);
	});
}

export function useCapabilitiesModel({
	skills,
	searchQuery,
	skillLoading,
	skillError,
	actionStates,
	sectionId,
	onInstallSkill,
	onToggleSkill,
	onUninstallSkill,
	onPreviewSkill,
	onRefreshSkills,
}: UseCapabilitiesModelOptions): CapabilitiesModel {
	const { t } = useTranslation("settings");
	const [scope, setScope] = useState<CapabilityScope>(() =>
		sectionId?.includes("server-list") ? "mine" : "discover",
	);
	const mcp = useMcpSettingsModel();
	const remote = useRemoteMcpSectionModel({
		onAdd: mcp.onAddRemoteServer,
		onRemove: mcp.onRemoveRemoteServer,
	});

	useEffect(() => {
		if (!sectionId) return;
		setScope(sectionId.includes("server-list") ? "mine" : "discover");
	}, [sectionId]);

	const connectorCapabilities = useMemo(() => {
		const servers = mcp.config?.mcpServers ?? {};
		const marketByName = new Map((remote.items ?? []).map((item) => [item.name, item]));
		const listedPresets = getListedBuiltinMcpPresets();
		const listedNames = new Set(listedPresets.map((preset) => preset.name));

		const createConnector = (
			name: string,
			preset: BuiltinMcpPreset | undefined,
			market: MarketMcpServer | undefined,
		): ConnectorCapability => {
			const server = servers[name];
			const matchedPreset = preset ?? (server ? matchBuiltinMcpPreset(name, server) : undefined);
			const title = matchedPreset
				? t(matchedPreset.displayNameKey)
				: server?.displayName || market?.display_name || name;
			const description = matchedPreset
				? t(matchedPreset.descriptionKey)
				: server?.description?.trim() || market?.description || "";
			const usesOAuth = server ? serverUsesOAuth(name, server) : false;
			const authorized = usesOAuth && Boolean(mcp.oauthAuthByName[name]);
			const needsSecrets = Boolean(
				server && matchedPreset && missingRequiredSecrets(matchedPreset, server).length > 0,
			);
			const installed = Boolean(server);

			return {
				driver: "connector",
				id: `connector:${name}`,
				name,
				title,
				description,
				iconUrl: server
					? (resolveMcpIcon(name, server) ?? market?.icon)
					: matchedPreset
						? builtinMcpIconUrl(matchedPreset.iconFile)
						: market?.icon,
				installed,
				enabled: installed && !(server?.disabled ?? false),
				readonly: false,
				needsUpdate: false,
				setupRequired: installed && (needsSecrets || (usesOAuth && !authorized)),
				authorized,
				busy: mcp.busyPresetName === name || mcp.oauthBusyName === name || remote.busy === name,
				downloadCount: 0,
				isCustom: installed && !matchedPreset && !market,
				searchTerms: [name, title, description],
				preset: matchedPreset,
				market,
				usesOAuth,
				canConfigure: installed && Boolean(matchedPreset?.secrets?.length),
				canEdit: Boolean(server && !isBuiltinMcpServer(name, server)),
			};
		};

		const discover = [
			...listedPresets.map((preset) => createConnector(preset.name, preset, marketByName.get(preset.name))),
			...(remote.items ?? [])
				.filter((item) => !listedNames.has(item.name))
				.map((item) => createConnector(item.name, undefined, item)),
		];

		const mine = Object.keys(servers).map((name) => {
			const server = servers[name];
			const preset = server ? matchBuiltinMcpPreset(name, server) : undefined;
			return createConnector(name, preset, marketByName.get(name));
		});

		return { discover, mine };
	}, [mcp.busyPresetName, mcp.config, mcp.oauthAuthByName, mcp.oauthBusyName, remote.busy, remote.items, t]);

	const items = useMemo(() => {
		const skillItems = skills.map((skill) => toSkillCapability(skill, actionStates));
		const visibleSkills =
			scope === "discover"
				? skillItems.filter((item) => !item.skill.isCustom && !item.skill.isAgent)
				: skillItems.filter((item) => item.installed);
		const connectors = scope === "discover" ? connectorCapabilities.discover : connectorCapabilities.mine;
		return sortCapabilities(filterCapabilities([...visibleSkills, ...connectors], searchQuery), scope);
	}, [actionStates, connectorCapabilities, scope, searchQuery, skills]);

	const add = useCallback(
		(item: CapabilityItem) => {
			if (item.driver === "skill") {
				onInstallSkill(item.skill);
				return;
			}
			if (item.preset) {
				void mcp.onAddBuiltinServer(item.preset);
				return;
			}
			if (item.market) void remote.handleAction(item.market, "add");
		},
		[mcp, onInstallSkill, remote],
	);

	const remove = useCallback(
		(item: CapabilityItem) => {
			if (item.driver === "skill") {
				onUninstallSkill(item.skill.name, item.skill.type);
				return;
			}
			void mcp.onDeleteServer(item.name);
		},
		[mcp, onUninstallSkill],
	);

	const toggle = useCallback(
		(item: CapabilityItem) => {
			if (item.driver === "skill") {
				onToggleSkill(item.skill.name);
				return;
			}
			void mcp.onToggleDisabled(item.name);
		},
		[mcp, onToggleSkill],
	);

	const setup = useCallback(
		(item: ConnectorCapability) => {
			if (item.canConfigure && item.preset) {
				mcp.onConfigureBuiltinSecrets(item.name);
				return;
			}
			if (item.usesOAuth && !item.authorized) void mcp.onAuthorizeOAuth(item.name);
		},
		[mcp],
	);

	const refresh = useCallback(() => {
		onRefreshSkills();
		remote.load();
	}, [onRefreshSkills, remote]);

	const errors = useMemo(
		() => Array.from(new Set([skillError, remote.error].filter((value): value is string => Boolean(value)))),
		[remote.error, skillError],
	);

	return {
		scope,
		setScope,
		items,
		loading: mcp.config === null || ((skillLoading || remote.loading) && items.length === 0),
		refreshing: skillLoading || remote.loading,
		errors,
		mcp,
		add,
		remove,
		toggle,
		setup,
		configure: (item) => mcp.onConfigureBuiltinSecrets(item.name),
		edit: (item) => mcp.onToggleEditServer(item.name),
		revokeAuthorization: (item) => {
			void mcp.onRevokeOAuth(item.name);
		},
		preview: (item) => onPreviewSkill(item.skill),
		refresh,
	};
}
