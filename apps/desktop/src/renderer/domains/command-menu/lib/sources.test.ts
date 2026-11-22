// @vitest-environment jsdom
import type { InstalledPlugin, SkillInfo } from "@preload/api";
import type { Project, RegisteredWorkspaceView } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import type { DesktopSessionSearchResult } from "@/shared/session-search";
import {
	buildInstalledAbilityEntries,
	buildMarketplaceEscapeEntry,
	buildProjectEntries,
	buildSessionEntries,
	buildSettingsEntries,
	buildWorkspaceViewEntries,
	type CommandMenuSourceLabels,
} from "./sources";

const idleActivity = {
	runningPaths: new Set<string>(),
	waitingPaths: new Map<string, number>(),
	attentionPaths: new Set<string>(),
};
const idle = { activity: idleActivity, recentRank: new Map<string, number>(), asRecentGroup: false };

const labels: CommandMenuSourceLabels = {
	sessionTypes: { conversation: "Chat", claw: "Claw", project: "Project", batch: "Batch" },
	sessionStatus: { running: "Running", waiting: "Waiting", unread: "Finished" },
	sessionUnavailable: "No access",
	settingsGroupHint: "Settings",
	abilitySkill: "Skill",
	abilityPlugin: "Plugin",
	searchMarketplace: "Search the marketplace",
};

function session(overrides: Partial<DesktopSessionSearchResult> = {}): DesktopSessionSearchResult {
	return {
		session: {
			id: "s1",
			path: "/w/a.jsonl",
			cwd: "/w",
			name: "Release plan",
			firstMessage: "",
			modifiedAt: 10,
			access: { readHistory: true, resume: true, rename: true, delete: true },
		},
		sourceCwd: "/w/project-a",
		sourceKind: "project",
		sourceName: "Project A",
		match: { field: "title", snippet: "Release plan" },
		...overrides,
	};
}

describe("buildProjectEntries", () => {
	it("keeps the sidebar ordering and falls back to the directory name", () => {
		const projects: Project[] = [
			{ cwd: "/w/alpha", name: "Alpha", sessionCount: 1, type: "normal" },
			{ cwd: "/w/beta-dir", sessionCount: 0, type: "normal" },
		];
		const entries = buildProjectEntries(projects);

		expect(entries.map((entry) => entry.title)).toEqual(["Alpha", "beta-dir"]);
		expect(entries.map((entry) => entry.order)).toEqual([0, 1]);
		expect(entries[0].action).toEqual({ kind: "openProject", cwd: "/w/alpha" });
		expect(entries[0].id).toBe("project:/w/alpha");
		// 不展示绝对路径。
		expect(entries.every((entry) => entry.subtitle === undefined)).toBe(true);
	});
});

describe("buildSessionEntries", () => {
	it("badges the owning project (or the type for project-less chats) and preserves the backend ordering", () => {
		const entries = buildSessionEntries(
			[
				session(),
				session({ sourceKind: "claw", sourceName: undefined }),
				session({ sourceName: undefined, sourceCwd: "/w/beta-dir" }),
			],
			labels,
			idle,
		);

		expect(entries.map((entry) => entry.badge)).toEqual(["Project A", "Claw", "beta-dir"]);
		expect(entries.every((entry) => entry.subtitle === undefined)).toBe(true);
		expect(entries.map((entry) => entry.groupKey)).toEqual(["sessions", "sessions", "sessions"]);
		expect(entries.map((entry) => entry.order)).toEqual([0, 1, 2]);
	});

	it("moves running and waiting sessions into the in-progress group, waiting first", () => {
		const running = session({ session: { ...session().session, path: "/w/run.jsonl" } });
		const waiting = session({ session: { ...session().session, path: "/w/wait.jsonl" } });
		const both = session({ session: { ...session().session, path: "/w/both.jsonl" } });
		const entries = buildSessionEntries([running, waiting, both, session()], labels, {
			activity: {
				runningPaths: new Set(["/w/run.jsonl", "/w/both.jsonl"]),
				waitingPaths: new Map([
					["/w/wait.jsonl", 1],
					["/w/both.jsonl", 2],
				]),
				attentionPaths: new Set(),
			},
			recentRank: new Map(),
			asRecentGroup: false,
		});

		expect(entries.map((entry) => [entry.status, entry.statusLabel, entry.groupKey, entry.priority])).toEqual([
			["running", "Running", "activeSessions", 1],
			["waiting", "Waiting", "activeSessions", 0],
			["waiting", "Waiting", "activeSessions", 0],
			[undefined, undefined, "sessions", Number.MAX_SAFE_INTEGER],
		]);
	});

	it("keeps a finished but unopened session in progress after it stops running", () => {
		const done = session({ session: { ...session().session, path: "/w/done.jsonl" } });
		const running = session({ session: { ...session().session, path: "/w/run.jsonl" } });
		const entries = buildSessionEntries([done, running], labels, {
			activity: {
				runningPaths: new Set(["/w/run.jsonl"]),
				waitingPaths: new Map(),
				// 正在跑的会话也可能留有上一轮的「未看」记录：在跑优先显示。
				attentionPaths: new Set(["/w/done.jsonl", "/w/run.jsonl"]),
			},
			recentRank: new Map(),
			asRecentGroup: false,
		});

		expect(entries.map((entry) => [entry.status, entry.statusLabel, entry.groupKey, entry.priority])).toEqual([
			["unread", "Finished", "activeSessions", 2],
			["running", "Running", "activeSessions", 1],
		]);
	});

	it("ranks opened sessions ahead of never-opened ones, most recent first", () => {
		const at = (path: string) => session({ session: { ...session().session, path } });
		const entries = buildSessionEntries([at("/w/never.jsonl"), at("/w/old.jsonl"), at("/w/new.jsonl")], labels, {
			...idle,
			recentRank: new Map([
				["/w/new.jsonl", 0],
				["/w/old.jsonl", 1],
			]),
		});
		const sorted = [...entries].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
		expect(sorted.map((entry) => entry.id)).toEqual([
			"session:/w/new.jsonl",
			"session:/w/old.jsonl",
			"session:/w/never.jsonl",
		]);
		expect(entries.every((entry) => entry.groupKey === "sessions")).toBe(true);
	});

	it("files idle sessions under recently opened when listing without a query", () => {
		const [entry] = buildSessionEntries([session()], labels, { ...idle, asRecentGroup: true });
		expect(entry.groupKey).toBe("recentSessions");
	});

	it("marks an unreachable session as disabled instead of dropping it", () => {
		const locked = session({
			session: {
				...session().session,
				access: { readHistory: false, resume: false, rename: false, delete: false },
			},
		});
		const [entry] = buildSessionEntries([locked], labels, idle);

		expect(entry.disabled).toBe(true);
		expect(entry.disabledReason).toBe("No access");
	});

	it("keeps a history-only session enabled so it can open in the viewer", () => {
		const readOnly = session({
			session: {
				...session().session,
				access: { readHistory: true, resume: false, rename: false, delete: false },
			},
		});
		expect(buildSessionEntries([readOnly], labels, idle)[0].disabled).toBe(false);
	});
});

describe("buildSettingsEntries", () => {
	const visible = { isMac: true, isWindows: false };
	const translate = (key: string) => key;

	it("emits section-level entries that deep link with the section id", () => {
		const entries = buildSettingsEntries(visible, translate);
		const language = entries.find((entry) => entry.id === "settings:appearance-language");

		expect(language).toBeDefined();
		expect(language?.action).toEqual({
			kind: "openSettingsSection",
			tab: "appearance",
			section: "appearance-language",
		});
		expect(language?.subtitle).toBe("tabAppearance");
	});

	it("drops sections whose tab is hidden on this platform", () => {
		const windows = buildSettingsEntries({ ...visible, isMac: false, isWindows: true }, translate);
		// appshot 是 macOnly 标签，其 section 在 Windows 上不该出现在搜索结果里。
		expect(windows.some((entry) => entry.id === "settings:appshot-gesture")).toBe(false);
		expect(buildSettingsEntries(visible, translate).some((entry) => entry.id === "settings:appshot-gesture")).toBe(
			true,
		);
	});

	it("drops the mcp sections that would redirect away to the abilities page", () => {
		const entries = buildSettingsEntries(visible, translate);
		expect(entries.some((entry) => entry.id.startsWith("settings:mcp-"))).toBe(false);
	});
});

describe("buildWorkspaceViewEntries", () => {
	it("resolves catalog placeholders in both the label and the plugin name", () => {
		const catalog: Record<string, string> = { "%diff.title%": "Diff", "%plugin.name%": "Git" };
		const views = [
			{ pluginId: "git", pluginName: "%plugin.name%", viewId: "diff", label: "%diff.title%" },
		] as unknown as RegisteredWorkspaceView[];
		const [entry] = buildWorkspaceViewEntries(views, (_view, raw) => catalog[raw] ?? raw);

		expect(entry.title).toBe("Diff");
		// pluginName 同样可能是占位符；漏解析时副标题会直接显示 %plugin.name%。
		expect(entry.subtitle).toBe("Git");
		expect(entry.action).toEqual({ kind: "openWorkspaceView", pluginId: "git", viewId: "diff" });
	});
});

describe("buildInstalledAbilityEntries", () => {
	it("covers skills and plugins with a marketplace-search action carrying the exact name", () => {
		const skills: SkillInfo[] = [
			{ name: "commit", alias: "Commit helper", description: "Write commits", source: "market", type: "skill" },
			{ name: "story", description: "", source: "builtin", type: "skill" },
		];
		const plugins = [{ id: "vetta.git", name: "Git" }] as unknown as InstalledPlugin[];
		const entries = buildInstalledAbilityEntries({ skills, plugins }, labels);

		expect(entries.map((entry) => entry.title)).toEqual(["Commit helper", "story", "Git"]);
		expect(entries.map((entry) => entry.badge)).toEqual(["Skill", "Skill", "Plugin"]);
		// 面板里列出的都是已装能力，落到「发现」分区会搜不到自己。
		expect(entries[0].action).toEqual({ kind: "openAbilities", query: "Commit helper", scope: "mine" });
		expect(entries.every((entry) => entry.action.kind === "openAbilities" && entry.action.scope === "mine")).toBe(
			true,
		);
		expect(entries.map((entry) => entry.order)).toEqual([0, 1, 2]);
	});

	it("omits internal plugin skills and uses public presentation text", () => {
		const skills: SkillInfo[] = [
			{ name: "internal", description: "Hidden", source: "plugin", type: "skill" },
			{
				name: "vetta-ui-design",
				description: "Internal",
				source: "plugin",
				type: "skill",
				presentation: {
					defaultVisibility: "visible",
					displayName: "Vetta 设计",
					displayDescription: "设计产品界面",
				},
			},
		];

		const entries = buildInstalledAbilityEntries({ skills, plugins: [] }, labels);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			id: "ability:skill:vetta-ui-design",
			title: "Vetta 设计",
			subtitle: "设计产品界面",
		});
	});
});

describe("buildMarketplaceEscapeEntry", () => {
	it("pins itself to the bottom and forwards the trimmed query", () => {
		const entry = buildMarketplaceEscapeEntry("  notion  ", labels);
		expect(entry.pinnedToBottom).toBe(true);
		// 逃生行的语义是去市场找没装的，故落到「发现」。
		expect(entry.action).toEqual({ kind: "openAbilities", query: "notion", scope: "discover" });
	});

	it("omits the query entirely when nothing was typed", () => {
		expect(buildMarketplaceEscapeEntry("   ", labels).action).toEqual({
			kind: "openAbilities",
			query: undefined,
			scope: "discover",
		});
	});
});
