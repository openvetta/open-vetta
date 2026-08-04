/**
 * Skill / scene command expansion.
 *
 * Extracted from AgentSession to keep the facade thin. These are pure-ish
 * functions: they read skills from disk and may prefill the todo store for
 * scenes, but all dependencies are passed in explicitly.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionResourceRuntime as ResourceLoader } from "../../resources/index.js";
import { readSkillContent } from "../../resources/skills/index.js";
import { stripFrontmatter } from "../../utils/frontmatter.js";
import type { TodoStore } from "../todo-store.js";
import type { PromptResourceRef } from "./types.js";

/** Parsed skill block from a user message */
export interface ParsedSkillBlock {
	name: string;
	location: string;
	content: string;
	userMessage: string | undefined;
}

/**
 * Parse a skill block from message text.
 * Returns null if the text doesn't contain a skill block.
 */
export function parseSkillBlock(text: string): ParsedSkillBlock | null {
	const match = text.match(/^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/);
	if (!match) return null;
	return {
		name: match[1],
		location: match[2],
		content: match[3],
		userMessage: match[4]?.trim() || undefined,
	};
}

/** Result of expanding a skill/scene command. */
export interface SkillExpansionResult {
	text: string;
	sceneInjection?: string;
	skillInjection?: string;
	promptRef?: PromptResourceRef;
}

/** Dependencies required to expand skill/scene commands. */
export interface SkillExpansionDeps {
	resourceLoader: Pick<ResourceLoader, "getSkills">;
	todoStore: TodoStore;
	/** Emit an error (typically via the extension runner). Best-effort. */
	emitError?: (error: { extensionPath: string; event: string; error: string }) => void;
}

/**
 * Expand skill/scene commands (/skill:name or /scene:name args) to their full content.
 * Returns the expanded text, or the original text if not a skill/scene command or not found.
 * Emits errors via deps.emitError if file read fails.
 */
function expandPromptResource(
	text: string,
	promptRef: PromptResourceRef,
	deps: SkillExpansionDeps,
	options: { structured: boolean; legacyArgs?: string },
): SkillExpansionResult {
	const { resourceLoader, todoStore } = deps;
	const name = promptRef.name.trim();
	const isScene = promptRef.kind === "scene";
	const allSkills = resourceLoader.getSkills().skills;
	const skill = isScene
		? allSkills.find((s) => s.name === name && s.type === "scene")
		: allSkills.find((s) => s.name === name && (!options.structured || s.type !== "scene"));
	if (!skill) {
		console.info("[skills] expand miss", { kind: promptRef.kind, name });
		return options.structured ? { text, promptRef } : { text }; // Missing structured refs are normal (e.g. uninstalled).
	}

	try {
		const content = readSkillContent(skill);
		const body = stripFrontmatter(content).trim();

		if (isScene) {
			// Scene expansion: include read-only instructions + auto-create todos from tasks.json
			const lines: string[] = [
				`<scene name="${skill.name}" location="${skill.filePath}">`,
				"",
				`SCENE_DIR="${skill.baseDir}"`,
				`ALL relative paths in this scene MUST be resolved against SCENE_DIR using absolute paths.`,
				`For example: bash "${skill.baseDir}/scripts/run.sh" — do NOT cd into the scene directory.`,
				`IMPORTANT: Use the literal path above. Do NOT use shell variables like $SCENE_DIR — no such variable exists in the shell environment.`,
				"",
				`CRITICAL: The scene directory is READ-ONLY. NEVER write, create, or modify any files inside the scene directory.`,
				`NEVER cd into the scene directory. Stay in the user's working directory (cwd) at all times.`,
				`All output files and artifacts MUST be written to cwd, NOT into the scene directory.`,
				"",
				body,
				`</scene>`,
			];

			// Auto-create todo items from tasks.json.
			// If the store is already locked by a previous scene invocation in this session,
			// we leave the existing list untouched (per the "ignore re-invocation" rule)
			// and instruct the LLM to keep working through the existing items.
			const tasksJsonPath = join(skill.baseDir, "tasks.json");
			if (todoStore.isLocked()) {
				const existing = todoStore.getAll().length;
				lines.push(
					"",
					`[SYSTEM] The todo list is already locked from an earlier scene invocation in this session (${existing} items).`,
					`Do NOT call todo(action="create") — it will be rejected.`,
					`Continue working through the existing items in strict sequential order.`,
					`Use todo(action="list") to view current progress.`,
				);
			} else if (existsSync(tasksJsonPath)) {
				try {
					const tasksRaw = readFileSync(tasksJsonPath, "utf-8");
					const tasks: unknown = JSON.parse(tasksRaw);
					if (Array.isArray(tasks) && tasks.length > 0 && tasks.every((t) => typeof t === "string")) {
						// Reset any prior todos (e.g. ad-hoc items the LLM created in a non-scene turn)
						// so the scene's tasks.json is the sole source of truth.
						todoStore.clear();
						todoStore.createMany(tasks as string[]);
						todoStore.lock("scene");
						lines.push(
							"",
							`[SYSTEM] ${tasks.length} todo items have been auto-created from this scene's tasks.json and the list is now LOCKED.`,
							`Do NOT call todo(action="create") — it will be rejected. The tasks.json list is the authoritative plan.`,
							`Work strictly through these items in order. Start now with todo(action="update", id=1, status="in_progress").`,
							`After finishing each item, IMMEDIATELY call todo(action="update", id=N, status="done") before moving on to the next.`,
						);
					}
				} catch {
					// Malformed tasks.json — silently skip
				}
			}

			// Scene content is injected as a hidden custom message, not shown in user's message bubble
			const userText = options.legacyArgs || text;
			console.info("[skills] expand", {
				kind: "scene",
				name: skill.name,
				source: skill.source,
				path: skill.filePath,
				hasArgs: Boolean(options.legacyArgs),
			});
			return { text: userText, sceneInjection: lines.join("\n"), promptRef };
		}

		// Skill expansion mirrors scene: inject the expanded block as a hidden custom
		// message. Legacy commands keep their shorthand in text; structured callers
		// provide clean user text and persist the reference in custom-message details.
		const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
		console.info("[skills] expand", {
			kind: "skill",
			name: skill.name,
			source: skill.source,
			path: skill.filePath,
			hasArgs: Boolean(options.legacyArgs),
		});
		return { text, skillInjection: skillBlock, promptRef };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.info("[skills] expand error", {
			kind: isScene ? "scene" : "skill",
			name: skill.name,
			path: skill.filePath,
			error,
		});
		deps.emitError?.({
			extensionPath: skill.filePath,
			event: "skill_expansion",
			error,
		});
		return options.structured ? { text, promptRef } : { text }; // Keep structured metadata, skip unavailable content.
	}
}

/** Expand a structured top-level Skill / Scene reference when the resource is available. */
export function expandSkillReference(
	text: string,
	promptRef: PromptResourceRef,
	deps: SkillExpansionDeps,
): SkillExpansionResult {
	const name = promptRef.name.trim();
	if (!name) throw new Error("Prompt resource name must not be empty");
	return expandPromptResource(text, { ...promptRef, name }, deps, { structured: true });
}

export function expandSkillCommand(text: string, deps: SkillExpansionDeps): SkillExpansionResult {
	let kind: PromptResourceRef["kind"];
	let prefix: string;
	if (text.startsWith("/skill:")) {
		kind = "skill";
		prefix = "/skill:";
	} else if (text.startsWith("/scene:")) {
		kind = "scene";
		prefix = "/scene:";
	} else {
		return { text };
	}

	const rest = text.slice(prefix.length);
	const sepMatch = rest.match(/[\s]/);
	const name = sepMatch ? rest.slice(0, sepMatch.index) : rest;
	const args = sepMatch ? rest.slice(sepMatch.index!).trim() : "";
	return expandPromptResource(text, { kind, name }, deps, { structured: false, legacyArgs: args });
}
