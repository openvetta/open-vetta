import type { ConversationDocument } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	EMPTY_SPACE_SIBLING_MIRROR,
	listSiblingProjects,
	parseSpaceSiblingMirror,
	readToldSiblingProjects,
	renderSiblingProjectsContext,
	resolveSessionSpace,
	SIBLING_PROJECTS_CONTEXT_TYPE,
	SIBLING_PROJECTS_PROMPT_LIMIT,
	type SiblingProject,
	sameSiblingProjects,
} from "./sibling-projects.js";

const CODE = { path: "/work/openvetta", name: "openvetta" };
const DESIGN = { path: "/work/vetta-design-templates" };
const DOCS = { path: "/work/docs", name: "文档" };
const OTHER = { path: "/work/client-a", name: "client-a" };
const REMOTE = { path: "ssh://host-1/srv/api", name: "api" };
const HOME = { path: "/Users/me", name: "home" };

const ACTIVE = [CODE, DESIGN, DOCS, OTHER, REMOTE];

const MIRROR = parseSpaceSiblingMirror({
	spaces: [
		{ id: "product", siblingProjects: true },
		{ id: "client", siblingProjects: false },
	],
	projects: {
		[CODE.path]: "product",
		[DESIGN.path]: "product",
		[DOCS.path]: "product",
		[OTHER.path]: "client",
		[REMOTE.path]: "product",
	},
	conversations: {
		"/Users/me/.vetta/conversation/.vetta/sessions/s1.jsonl": "product",
		"team-session-1": "product",
		"/Users/me/.vetta/conversation/.vetta/sessions/s2.jsonl": "client",
	},
});

describe("parseSpaceSiblingMirror", () => {
	it("defaults the switch to on and drops invalid or main-space entries", () => {
		const mirror = parseSpaceSiblingMirror({
			spaces: [
				{ id: "a" },
				{ id: "a", siblingProjects: false },
				{ id: "main", siblingProjects: true },
				{ id: "" },
				"broken",
				{ id: "b", siblingProjects: false },
			],
			projects: { "/p1": "a", "/p2": "main", "/p3": "ghost", "/p4": 42, "": "a" },
			conversations: { "/s1": "b", "/s2": "ghost" },
		});
		expect(mirror).toEqual({
			spaces: [
				{ id: "a", siblingProjects: true },
				{ id: "b", siblingProjects: false },
			],
			projects: { "/p1": "a" },
			conversations: { "/s1": "b" },
		});
	});

	it.each([undefined, null, 1, "x", []])("returns an empty mirror for %p", (value) => {
		expect(parseSpaceSiblingMirror(value)).toEqual(EMPTY_SPACE_SIBLING_MIRROR);
	});

	it("keeps keys like __proto__ as plain data", () => {
		const mirror = parseSpaceSiblingMirror(
			JSON.parse('{"spaces":[{"id":"a"}],"projects":{"__proto__":"a"},"conversations":{}}'),
		);
		expect(Object.hasOwn(mirror.projects, "__proto__")).toBe(true);
		expect(Object.getPrototypeOf(mirror.projects)).toBe(Object.prototype);
	});
});

describe("resolveSessionSpace", () => {
	it("puts a project session in its project's space and marks the project as self", () => {
		expect(resolveSessionSpace(MIRROR, ACTIVE, { cwd: CODE.path, sessionPath: "/x/s.jsonl" })).toEqual({
			spaceId: "product",
			selfProjectPath: CODE.path,
		});
	});

	it("matches project paths case- and separator-insensitively like project identity", () => {
		expect(resolveSessionSpace(MIRROR, ACTIVE, { cwd: "/WORK/OpenVetta/" })?.spaceId).toBe("product");
	});

	it("treats a project in the main space as having no space", () => {
		expect(resolveSessionSpace(MIRROR, [...ACTIVE, { path: "/work/loose" }], { cwd: "/work/loose" })).toBeUndefined();
	});

	it("does not fall back to conversation membership for a project session in the main space", () => {
		const mirror = parseSpaceSiblingMirror({
			spaces: [{ id: "product" }],
			projects: {},
			conversations: { "/sessions/s.jsonl": "product" },
		});
		expect(resolveSessionSpace(mirror, ACTIVE, { cwd: CODE.path, sessionPath: "/sessions/s.jsonl" })).toBeUndefined();
	});

	it("puts an independent conversation in the space it was assigned by session path", () => {
		expect(
			resolveSessionSpace(MIRROR, ACTIVE, {
				cwd: "/Users/me/.vetta/conversation/s1",
				sessionPath: "/Users/me/.vetta/conversation/.vetta/sessions/s1.jsonl",
			}),
		).toEqual({ spaceId: "product" });
	});

	it("does not treat a conversation as a session of a project that merely contains its cwd", () => {
		const mirror = parseSpaceSiblingMirror({
			spaces: [{ id: "product" }, { id: "home" }],
			projects: { [HOME.path]: "home", [CODE.path]: "product" },
			conversations: { "/Users/me/.vetta/conversation/.vetta/sessions/s1.jsonl": "product" },
		});
		expect(
			resolveSessionSpace(mirror, [HOME, CODE], {
				cwd: "/Users/me/.vetta/conversation/s1",
				sessionPath: "/Users/me/.vetta/conversation/.vetta/sessions/s1.jsonl",
			}),
		).toEqual({ spaceId: "product" });
	});

	it("resolves Team member sessions through their Team session id", () => {
		expect(
			resolveSessionSpace(MIRROR, ACTIVE, {
				cwd: "/Users/me/.vetta/teams/session-workspaces/t/1",
				sessionPath: "/Users/me/.vetta/teams/member.jsonl",
				teamSessionId: "team-session-1",
			}),
		).toEqual({ spaceId: "product" });
	});

	it("resolves a Team pinned to a project through the project", () => {
		expect(
			resolveSessionSpace(MIRROR, ACTIVE, {
				cwd: DOCS.path,
				sessionPath: "/x/member.jsonl",
				teamSessionId: "unassigned-team",
			}),
		).toEqual({ spaceId: "product", selfProjectPath: DOCS.path });
	});

	it("excludes remote project sessions entirely", () => {
		expect(
			resolveSessionSpace(MIRROR, ACTIVE, { cwd: REMOTE.path, teamSessionId: "team-session-1" }),
		).toBeUndefined();
	});

	it("returns undefined for an unassigned conversation", () => {
		expect(resolveSessionSpace(MIRROR, ACTIVE, { cwd: "/c/s9", sessionPath: "/c/s9.jsonl" })).toBeUndefined();
	});

	it("ignores an archived project (absent from the active list)", () => {
		expect(resolveSessionSpace(MIRROR, [DESIGN, DOCS], { cwd: CODE.path })).toBeUndefined();
	});
});

describe("listSiblingProjects", () => {
	it("lists local projects of the same space in registry order, excluding self", () => {
		expect(listSiblingProjects(MIRROR, ACTIVE, { cwd: CODE.path })).toEqual([
			{ name: "vetta-design-templates", path: DESIGN.path },
			{ name: "文档", path: DOCS.path },
		]);
	});

	it("lists every project of the space for an independent conversation", () => {
		expect(
			listSiblingProjects(MIRROR, ACTIVE, {
				cwd: "/Users/me/.vetta/conversation/s1",
				sessionPath: "/Users/me/.vetta/conversation/.vetta/sessions/s1.jsonl",
			}).map(({ path }) => path),
		).toEqual([CODE.path, DESIGN.path, DOCS.path]);
	});

	it("returns nothing when the space switch is off", () => {
		expect(
			listSiblingProjects(MIRROR, ACTIVE, {
				cwd: "/c/s2",
				sessionPath: "/Users/me/.vetta/conversation/.vetta/sessions/s2.jsonl",
			}),
		).toEqual([]);
		expect(listSiblingProjects(MIRROR, ACTIVE, { cwd: OTHER.path })).toEqual([]);
	});

	it("never lists remote projects even when they are in the space", () => {
		expect(listSiblingProjects(MIRROR, ACTIVE, { cwd: CODE.path }).some(({ path }) => path === REMOTE.path)).toBe(
			false,
		);
	});

	it("drops archived projects and duplicate registry entries", () => {
		expect(listSiblingProjects(MIRROR, [CODE, DOCS, { ...DOCS, path: "/work/DOCS/" }], { cwd: CODE.path })).toEqual([
			{ name: "文档", path: DOCS.path },
		]);
	});

	it("falls back to the folder name when a project has no (or a blank) name", () => {
		expect(listSiblingProjects(MIRROR, [CODE, { path: "/work/docs/", name: "  " }], { cwd: CODE.path })).toEqual([
			{ name: "docs", path: "/work/docs/" },
		]);
	});
});

describe("sameSiblingProjects", () => {
	const a = { name: "a", path: "/a" };
	const b = { name: "b", path: "/b" };
	it("ignores order", () => {
		expect(sameSiblingProjects([a, b], [b, a])).toBe(true);
	});
	it("notices renames, additions and removals", () => {
		expect(sameSiblingProjects([a], [{ ...a, name: "A" }])).toBe(false);
		expect(sameSiblingProjects([a], [a, b])).toBe(false);
		expect(sameSiblingProjects([a, b], [a])).toBe(false);
		expect(sameSiblingProjects([], [])).toBe(true);
	});
});

describe("renderSiblingProjectsContext", () => {
	it("lists names and paths and states the read/write boundary", () => {
		const text = renderSiblingProjectsContext([{ name: "文档", path: "/work/docs" }]);
		expect(text).toContain("- 文档: /work/docs");
		expect(text).toContain("without asking");
		expect(text).toContain("writing to them still needs the user's approval");
	});

	it(`caps the list at ${SIBLING_PROJECTS_PROMPT_LIMIT} and counts the rest`, () => {
		const projects = Array.from({ length: SIBLING_PROJECTS_PROMPT_LIMIT + 3 }, (_, index) => ({
			name: `p${index}`,
			path: `/p${index}`,
		}));
		const text = renderSiblingProjectsContext(projects);
		expect(text).toContain(`- p${SIBLING_PROJECTS_PROMPT_LIMIT - 1}: `);
		expect(text).not.toContain(`- p${SIBLING_PROJECTS_PROMPT_LIMIT}: `);
		expect(text).toContain("…and 3 more projects");
	});

	it("uses the singular for exactly one hidden project", () => {
		const projects = Array.from({ length: SIBLING_PROJECTS_PROMPT_LIMIT + 1 }, (_, index) => ({
			name: `p${index}`,
			path: `/p${index}`,
		}));
		expect(renderSiblingProjectsContext(projects)).toContain("…and 1 more project in");
	});

	it("tells the agent the earlier list no longer applies when it becomes empty", () => {
		expect(renderSiblingProjectsContext([])).toContain("no longer part of this conversation's Vetta workspace");
	});
});

describe("readToldSiblingProjects", () => {
	type Entry = ConversationDocument["entries"][number];
	const base = { timestamp: "2026-11-27T00:00:00.000Z" };
	const message = (id: string, parentId: string | null): Entry =>
		({ ...base, id, parentId, type: "message", message: { role: "user", content: "hi", timestamp: 0 } }) as Entry;
	const note = (id: string, parentId: string | null, projects: readonly SiblingProject[]): Entry => ({
		...base,
		id,
		parentId,
		type: "custom_message",
		customType: SIBLING_PROJECTS_CONTEXT_TYPE,
		content: "…",
		details: { projects },
		display: false,
		modelVisible: true,
	});
	const compaction = (id: string, parentId: string | null, firstKeptEntryId: string): Entry => ({
		...base,
		id,
		parentId,
		type: "compaction",
		summary: "summary",
		firstKeptEntryId,
		tokensBefore: 100,
	});
	const doc = (entries: Entry[], activeLeafId: string | null): ConversationDocument => ({
		identity: { sessionId: "s" } as ConversationDocument["identity"],
		journalVersion: entries.length,
		revision: entries.length,
		entries,
		activeLeafId,
	});
	const A = { name: "a", path: "/a" };
	const B = { name: "b", path: "/b" };

	it("returns an empty list when nothing was told", () => {
		expect(readToldSiblingProjects(doc([], null))).toEqual([]);
		expect(readToldSiblingProjects(doc([message("1", null)], "1"))).toEqual([]);
	});

	it("returns the latest note on the active branch", () => {
		const entries = [note("1", null, [A]), message("2", "1"), note("3", "2", [A, B]), message("4", "3")];
		expect(readToldSiblingProjects(doc(entries, "4"))).toEqual([A, B]);
	});

	it("ignores notes on other branches", () => {
		const entries = [message("1", null), note("2", "1", [A]), message("3", "2"), message("4", "1")];
		expect(readToldSiblingProjects(doc(entries, "4"))).toEqual([]);
	});

	it("treats a note summarized away by compaction as untold", () => {
		const entries = [note("1", null, [A]), message("2", "1"), message("3", "2"), compaction("4", "3", "3")];
		expect(readToldSiblingProjects(doc(entries, "4"))).toEqual([]);
	});

	it("keeps a note that compaction retained", () => {
		const entries = [message("1", null), note("2", "1", [A]), message("3", "2"), compaction("4", "3", "2")];
		expect(readToldSiblingProjects(doc(entries, "4"))).toEqual([A]);
	});

	it("treats a compaction whose kept entry is off-branch as dropping the note", () => {
		const entries = [note("1", null, [A]), compaction("2", "1", "missing")];
		expect(readToldSiblingProjects(doc(entries, "2"))).toEqual([]);
	});

	it("treats malformed note details as untold", () => {
		const broken: Entry = { ...note("1", null, []), details: { projects: [{ name: 1 }] } } as Entry;
		expect(readToldSiblingProjects(doc([broken], "1"))).toEqual([]);
	});

	it("survives a parent cycle", () => {
		const entries = [message("1", "2"), message("2", "1")];
		expect(readToldSiblingProjects(doc(entries, "1"))).toEqual([]);
	});
});
