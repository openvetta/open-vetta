import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
	readonly id: string;
	readonly permissions?: string[];
	readonly agent?: {
		readonly agents?: {
			id: string;
			name: string;
			description?: string;
			avatar?: string;
			systemPromptPath?: string;
			legacyIds?: string[];
		}[];
		readonly teams?: {
			id: string;
			name: string;
			description?: string;
			members: { agent: string; responsibility: string }[];
			workflowPath?: string;
		}[];
	};
}

async function readManifest(): Promise<Manifest> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, "../plugin.json"), "utf8")) as Manifest;
}

async function readLocale(locale: string): Promise<Record<string, string>> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, `../locales/${locale}.json`), "utf8")) as Record<
		string,
		string
	>;
}

async function readPrompt(path: string | undefined): Promise<string> {
	if (!path) throw new Error("Missing declared prompt path");
	return readFile(resolve(import.meta.dirname, "..", path), "utf8");
}

describe("Preset agent manifest", () => {
	it("contributes exactly the three host personas and asks for no permission", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("preset-agent");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual([
			"master",
			"developer",
			"researcher",
			"auditor",
			"business",
		]);
		// 纯人设插件：拿到任何权限都说明有别的东西混了进来。
		expect(manifest.permissions).toBeUndefined();
	});

	it("ships a readable prompt and avatar for every agent", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBeDefined();
			const prompt = await readFile(resolve(import.meta.dirname, "..", agent.systemPromptPath!), "utf8");
			expect(prompt.trim().length).toBeGreaterThan(0);
			expect(agent.avatar).toBeDefined();
			expect((await readFile(resolve(import.meta.dirname, "..", agent.avatar!))).byteLength).toBeGreaterThan(0);
		}
	});

	it("builds both teams out of its own agents, led by the master", async () => {
		const manifest = await readManifest();
		const agentIds = new Set((manifest.agent?.agents ?? []).map((agent) => agent.id));
		expect(manifest.agent?.teams?.map((team) => team.id)).toEqual(["dev-team", "planning-team"]);
		for (const team of manifest.agent?.teams ?? []) {
			// 第一个成员即队长，也是用户在会话里唯一的对话入口。
			expect(team.members[0]?.agent).toBe("master");
			// 刻意不引用别的提供方：那会让这支团队能不能用取决于另一个插件装没装。
			expect(team.members.every((member) => agentIds.has(member.agent))).toBe(true);
			expect(team.members.every((member) => member.responsibility.trim().length > 0)).toBe(true);
			const workflow = await readFile(resolve(import.meta.dirname, "..", team.workflowPath!), "utf8");
			expect(workflow.trim().length).toBeGreaterThan(0);
		}
	});

	it("ships a leader prompt that scales delegation to the request and preserves task verification", async () => {
		const manifest = await readManifest();
		const master = await readPrompt(manifest.agent?.agents?.find((agent) => agent.id === "master")?.systemPromptPath);

		expect(master).toContain("Answer simple questions, status requests, and bounded read-only reviews directly");
		expect(master).toContain("explicit workflow");
		expect(master).toContain("team_delegate_task");
		expect(master).toContain("team_wait_tasks");
		expect(master).toContain("team_get_task");
		expect(master).toContain("team_continue_task or team_retry_task only when its state permits");
		expect(master).toContain("meaningful results, decisions, or blockers");
		expect(master).toContain("If assigned as a member instead of leader");
		expect(master).toContain("Use only tools exposed in the current turn");
		expect(master).not.toContain("delegate each step");
	});

	it("routes specialist results to the current leader without repeated user-facing ceremonies", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents?.filter((candidate) => candidate.id !== "master") ?? []) {
			const prompt = await readPrompt(agent.systemPromptPath);
			expect(prompt, agent.id).toContain("As a member, report to the team leader");
			expect(prompt, agent.id).toContain("Do not transfer Team task ownership");
			expect(prompt, agent.id).toContain("Skip repeated user-facing kickoff and progress narration");
		}
	});

	it("keeps review read-only and requires specialists to disclose verification limits", async () => {
		const manifest = await readManifest();
		const auditor = await readPrompt(
			manifest.agent?.agents?.find((agent) => agent.id === "auditor")?.systemPromptPath,
		);
		const developer = await readPrompt(
			manifest.agent?.agents?.find((agent) => agent.id === "developer")?.systemPromptPath,
		);

		expect(auditor).toContain("Stay read-only unless changes are explicitly assigned");
		expect(auditor).toContain("what remains unverified");
		expect(auditor).toContain("passes or requires rework");
		expect(developer).toContain("A read-only review does not authorize implementation");
		expect(developer).toContain("distinguishing completed checks from checks not run");
	});

	it("keeps both declared workflows optional for read-only requests while retaining delivery review", async () => {
		const manifest = await readManifest();
		for (const team of manifest.agent?.teams ?? []) {
			const workflow = await readPrompt(team.workflowPath);
			expect(workflow, team.id).toContain("For questions, status requests, or read-only reviews");
			expect(workflow, team.id).toContain("do not start a build or planning loop");
			expect(workflow, team.id).toContain("Honor the user's explicit workflow and required review");
			expect(workflow, team.id).toContain("Auditor reports no blocking finding");
			expect(workflow, team.id).toContain("only for missing evidence");
		}
	});

	it("claims the ids the host used to ship, so existing profiles are upgraded in place", async () => {
		const manifest = await readManifest();
		const legacyIds = (manifest.agent?.agents ?? []).flatMap((agent) => agent.legacyIds ?? []);
		expect(legacyIds).toEqual(
			expect.arrayContaining(["master", "leader", "executor", "builder", "researcher", "auditor", "reviewer"]),
		);
		// 一个历史 id 只能由一个智能体接管，否则回填认领哪一份就成了顺序问题。
		expect(new Set(legacyIds).size).toBe(legacyIds.length);
	});

	it("resolves every %key% placeholder in both locales", async () => {
		const manifest = await readManifest();
		const placeholders = [
			...(manifest.agent?.agents ?? []).flatMap((agent) => [agent.name, agent.description ?? ""]),
			...(manifest.agent?.teams ?? []).flatMap((team) => [team.name, team.description ?? ""]),
		];
		for (const locale of ["zh", "en"]) {
			const messages = await readLocale(locale);
			for (const raw of placeholders) {
				const key = /^%([^%]+)%$/.exec(raw)?.[1];
				expect(key, `${raw} must be a locale placeholder`).toBeDefined();
				expect(messages[key!], `${key} missing in ${locale}`).toBeTruthy();
			}
		}
	});
});
