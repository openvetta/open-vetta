import type { ConversationDocument, PromptRequest } from "@vetta/runtime-core";
import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import { describe, expect, it, vi } from "vitest";
import { SIBLING_PROJECTS_CONTEXT_TYPE } from "./sibling-projects.js";
import {
	type SiblingProjectsRuntimePort,
	SiblingProjectsService,
	type SiblingProjectsServiceDependencies,
} from "./sibling-projects-service.js";
import { SpaceStore } from "./space-store.js";

const CODE = { path: "/work/openvetta", name: "openvetta" };
const DOCS = { path: "/work/docs", name: "文档" };
const DESIGN = { path: "/work/design", name: "design" };
const SESSION_PATH = "/c/.vetta/sessions/s1.jsonl";

const MIRROR = {
	spaces: [{ id: "product", siblingProjects: true }],
	projects: { [CODE.path]: "product", [DOCS.path]: "product" },
	conversations: { [SESSION_PATH]: "product" },
};

type Entry = ConversationDocument["entries"][number];

function createRuntime(overrides: Partial<SiblingProjectsRuntimePort> = {}) {
	const entries: Entry[] = [];
	const document = (): ConversationDocument => ({
		identity: { sessionId: "s1" } as ConversationDocument["identity"],
		journalVersion: entries.length,
		revision: entries.length,
		entries: [...entries],
		activeLeafId: entries.at(-1)?.id ?? null,
	});
	const runtime: SiblingProjectsRuntimePort = {
		getSessionPath: () => SESSION_PATH,
		readSessionWorkingDirectory: () => "/c/s1",
		readSessionDocument: () => document(),
		...overrides,
	};
	/** 模拟 Runtime 把本轮上下文写进会话文档。 */
	const commit = (request: PromptRequest) => {
		for (const record of request.context ?? []) {
			entries.push({
				id: String(entries.length + 1),
				parentId: entries.at(-1)?.id ?? null,
				timestamp: "2026-11-27T00:00:00.000Z",
				type: "custom_message",
				customType: record.type,
				content: record.content,
				details: record.metadata,
				display: record.display ?? false,
				modelVisible: record.modelVisible,
			});
		}
	};
	return { runtime, commit };
}

function createService(overrides: Partial<SiblingProjectsServiceDependencies> = {}) {
	const log = { warn: vi.fn() };
	let projects = [CODE, DOCS, DESIGN];
	let spaces: unknown;
	const service = new SiblingProjectsService({
		readActiveProjects: async () => projects,
		readTeamSessionId: async () => undefined,
		readSpaces: async () => spaces,
		log,
		...overrides,
	});
	return {
		service,
		log,
		setProjects: (next: typeof projects) => {
			projects = next;
		},
		/** 模拟主进程工作空间存储的当前内容（ADR-0160）。 */
		setSpaces: async (next: unknown) => {
			spaces = next;
		},
	};
}

function siblingRecords(request: PromptRequest): SessionContextRecord[] {
	return (request.context ?? []).filter((record) => record.type === SIBLING_PROJECTS_CONTEXT_TYPE);
}

function recordText(record: SessionContextRecord | undefined): string {
	const content = record?.content;
	return Array.isArray(content) ? content.map((part) => ("text" in part ? part.text : "")).join("") : String(content);
}

describe("SiblingProjectsService.decoratePrompt", () => {
	it("tells the agent about sibling projects on the first turn, hidden from the UI", async () => {
		const { service, setSpaces } = createService();
		const { runtime } = createRuntime();
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);

		const request = await service.decoratePrompt("s1", { text: "hi" });
		const [record] = siblingRecords(request);
		expect(record).toMatchObject({
			modelVisible: true,
			display: false,
			metadata: { projects: [CODE, DOCS] },
		});
		expect(recordText(record)).toContain("- openvetta: /work/openvetta");
		expect(request.text).toBe("hi");
	});

	it("adds nothing while the list is unchanged, then appends when it changes", async () => {
		const { service, setSpaces } = createService();
		const { runtime, commit } = createRuntime();
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);

		const first = await service.decoratePrompt("s1", { text: "1" });
		commit(first);
		expect(siblingRecords(await service.decoratePrompt("s1", { text: "2" }))).toEqual([]);

		await setSpaces({ ...MIRROR, projects: { ...MIRROR.projects, [DESIGN.path]: "product" } });
		const third = await service.decoratePrompt("s1", { text: "3" });
		expect(siblingRecords(third)[0]?.metadata).toEqual({ projects: [CODE, DOCS, DESIGN] });
	});

	it("tells the agent when the list becomes empty because the switch was turned off", async () => {
		const { service, setSpaces } = createService();
		const { runtime, commit } = createRuntime();
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);
		commit(await service.decoratePrompt("s1", { text: "1" }));

		await setSpaces({ ...MIRROR, spaces: [{ id: "product", siblingProjects: false }] });
		const next = await service.decoratePrompt("s1", { text: "2" });
		const [record] = siblingRecords(next);
		expect(record?.metadata).toEqual({ projects: [] });
		expect(recordText(record)).toContain("no longer part of");
		commit(next);
		expect(siblingRecords(await service.decoratePrompt("s1", { text: "3" }))).toEqual([]);
	});

	it("re-tells after a project is renamed", async () => {
		const { service, setProjects, setSpaces } = createService();
		const { runtime, commit } = createRuntime();
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);
		commit(await service.decoratePrompt("s1", { text: "1" }));
		setProjects([CODE, { ...DOCS, name: "Docs" }, DESIGN]);
		expect(siblingRecords(await service.decoratePrompt("s1", { text: "2" }))).toHaveLength(1);
	});

	it("adds nothing for sessions outside any custom space", async () => {
		const { service, setSpaces } = createService();
		const { runtime } = createRuntime({ getSessionPath: () => "/c/.vetta/sessions/other.jsonl" });
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);
		const request: PromptRequest = { text: "hi" };
		expect(await service.decoratePrompt("s1", request)).toBe(request);
	});

	it("keeps context supplied by the caller and appends after it", async () => {
		const { service, setSpaces } = createService();
		const { runtime } = createRuntime();
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);
		const existing: SessionContextRecord = { type: "other", content: "x", modelVisible: false };
		const request = await service.decoratePrompt("s1", { text: "hi", context: [existing] });
		expect(request.context?.[0]).toBe(existing);
		expect(request.context?.[1]?.type).toBe(SIBLING_PROJECTS_CONTEXT_TYPE);
	});

	it("re-tells when the session document cannot be read", async () => {
		const { service, setSpaces } = createService();
		const { runtime } = createRuntime({
			readSessionDocument: () => {
				throw new Error("not loaded");
			},
		});
		service.attachRuntime(runtime);
		await setSpaces(MIRROR);
		expect(siblingRecords(await service.decoratePrompt("s1", { text: "hi" }))).toHaveLength(1);
	});

	it("sends the prompt unchanged when resolving fails or no runtime is attached", async () => {
		const { service, log, setSpaces } = createService({
			readActiveProjects: async () => {
				throw new Error("config unreadable");
			},
		});
		const request: PromptRequest = { text: "hi" };
		expect(await service.decoratePrompt("s1", request)).toBe(request);
		service.attachRuntime(createRuntime().runtime);
		await setSpaces(MIRROR);
		expect(await service.decoratePrompt("s1", request)).toBe(request);
		expect(log.warn).toHaveBeenCalled();
	});

	it("resolves Team member sessions through the ownership lookup", async () => {
		const readTeamSessionId = vi.fn(async () => "team-1");
		const { service, setSpaces } = createService({ readTeamSessionId });
		const { runtime } = createRuntime({
			getSessionPath: () => "/teams/member.jsonl",
			readSessionWorkingDirectory: () => "/teams/workspace",
		});
		service.attachRuntime(runtime);
		await setSpaces({ ...MIRROR, conversations: { "team-1": "product" } });
		expect(await service.readRoots("member")).toEqual([CODE.path, DOCS.path]);
		expect(readTeamSessionId).toHaveBeenCalledWith("/teams/member.jsonl");
	});
});

describe("SiblingProjectsService.readRoots", () => {
	it("follows the latest mirror immediately", async () => {
		const { service, setSpaces } = createService();
		service.attachRuntime(createRuntime().runtime);
		await setSpaces(MIRROR);
		expect(await service.readRoots("s1")).toEqual([CODE.path, DOCS.path]);
		await setSpaces({ ...MIRROR, projects: { [CODE.path]: "product" } });
		expect(await service.readRoots("s1")).toEqual([CODE.path]);
	});

	it("returns no roots (and logs) when resolution fails", async () => {
		const { service, log, setSpaces } = createService({
			readTeamSessionId: async () => {
				throw new Error("catalog corrupt");
			},
		});
		service.attachRuntime(createRuntime().runtime);
		await setSpaces(MIRROR);
		expect(await service.readRoots("s1")).toEqual([]);
		expect(log.warn).toHaveBeenCalled();
	});

	it("returns no roots for an empty session id", async () => {
		const { service, setSpaces } = createService();
		service.attachRuntime(createRuntime().runtime);
		await setSpaces(MIRROR);
		expect(await service.readRoots("")).toEqual([]);
	});
});

describe("SiblingProjectsService workspace store", () => {
	it("reads the workspace store on every call so changes apply immediately", async () => {
		const readSpaces = vi.fn(async () => MIRROR);
		const { service } = createService({ readSpaces });
		service.attachRuntime(createRuntime().runtime);
		await service.readRoots("s1");
		await service.readRoots("s1");
		expect(readSpaces).toHaveBeenCalledTimes(2);
	});

	it("accepts the stored shape with names and icons", async () => {
		const { service, setSpaces } = createService();
		service.attachRuntime(createRuntime().runtime);
		await setSpaces({
			spaces: [{ id: "product", name: "Product", icon: { kind: "solar", value: "code" } }],
			projects: MIRROR.projects,
			conversations: MIRROR.conversations,
		});
		expect(await service.readRoots("s1")).toEqual([CODE.path, DOCS.path]);
	});

	it("returns no roots (and logs) when the store cannot be read", async () => {
		const { service, log } = createService({
			readSpaces: async () => {
				throw new Error("EACCES");
			},
		});
		service.attachRuntime(createRuntime().runtime);
		expect(await service.readRoots("s1")).toEqual([]);
		expect(log.warn).toHaveBeenCalled();
	});

	it("sees nothing before any workspace exists", async () => {
		const { service } = createService();
		service.attachRuntime(createRuntime().runtime);
		expect(await service.readRoots("s1")).toEqual([]);
	});

	it("follows a real workspace store from the upgrade handshake through a later toggle", async () => {
		let file: string | undefined;
		const store = new SpaceStore({
			io: {
				read: async () => file,
				write: async (content) => {
					file = content;
				},
				backupCorrupt: async () => {},
			},
		});
		const { service } = createService({ readSpaces: async () => (await store.read()).data });
		service.attachRuntime(createRuntime().runtime);
		const icon = { kind: "solar", value: "code" };
		const local = {
			spaces: [{ id: "product", name: "Product", icon }],
			projects: MIRROR.projects,
			conversations: MIRROR.conversations,
		};
		expect(await service.readRoots("s1")).toEqual([]);
		await store.sync({ sourceId: "prod", local, localDirty: false });
		expect(await service.readRoots("s1")).toEqual([CODE.path, DOCS.path]);
		await store.save({ ...local, spaces: [{ id: "product", name: "Product", icon, siblingProjects: false }] });
		expect(await service.readRoots("s1")).toEqual([]);
	});
});
