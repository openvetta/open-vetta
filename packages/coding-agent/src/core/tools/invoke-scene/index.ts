import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { stripFrontmatter } from "../../../utils/frontmatter.js";
import type { Skill } from "../../skills.js";
import type { TodoStore } from "../../todo-store.js";
import { loadToolDescription } from "../description.js";

const invokeSceneSchema = Type.Object({
	name: Type.String({
		description: "The exact scene name from the /scene: prefix in the user's message",
	}),
	args: Type.Optional(
		Type.String({
			description: "Optional arguments to pass to the scene",
		}),
	),
});

export type InvokeSceneToolInput = Static<typeof invokeSceneSchema>;

export interface InvokeSceneToolDetails {
	sceneName: string;
	sceneLocation: string;
}

export interface InvokeSceneToolOptions {
	/** Function to resolve available scenes at execution time */
	getScenes: () => Skill[];
	/** TodoStore instance for auto-creating predefined tasks */
	getTodoStore?: () => TodoStore;
}

export function createInvokeSceneTool(options: InvokeSceneToolOptions): AgentTool<typeof invokeSceneSchema> {
	const fallbackDescription =
		"Invoke a scene by name. Only call this when the user's message starts with /scene: prefix.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "invoke_scene",
		label: "invoke_scene",
		description,
		parameters: invokeSceneSchema,
		execute: async (_toolCallId: string, { name, args }: { name: string; args?: string }) => {
			const scenes = options.getScenes();
			const scene = scenes.find((s) => s.name === name && s.type === "scene");

			if (!scene) {
				const availableNames = scenes.filter((s) => s.type === "scene").map((s) => s.name);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: Scene "${name}" not found. Available scenes: ${availableNames.join(", ") || "(none)"}`,
						},
					],
					details: { sceneName: name, sceneLocation: "" },
				};
			}

			try {
				const rawContent = readFileSync(scene.filePath, "utf-8");
				const body = stripFrontmatter(rawContent).trim();

				// Auto-create todo items from tasks.json if present
				let tasksNote = "";
				const tasksJsonPath = join(scene.baseDir, "tasks.json");
				if (existsSync(tasksJsonPath)) {
					try {
						const tasksRaw = readFileSync(tasksJsonPath, "utf-8");
						const tasks: unknown = JSON.parse(tasksRaw);
						if (Array.isArray(tasks) && tasks.length > 0 && tasks.every((t) => typeof t === "string")) {
							const todoStore = options.getTodoStore?.();
							if (todoStore) {
								todoStore.createMany(tasks as string[]);
								tasksNote =
									`\n[SYSTEM] ${tasks.length} todo items have been auto-created from this scene's tasks.json.\n` +
									`Do NOT create your own todo list. Follow the existing todo items in strict sequential order.\n` +
									`Use todo(action="list") to see them, then start with todo(action="update", id=1, status="in_progress").\n`;
							}
						}
					} catch {
						// Malformed tasks.json — silently skip, scene still works without it
					}
				}

				const lines: string[] = [
					`<scene name="${scene.name}" location="${scene.filePath}">`,
					"",
					`SCENE_DIR="${scene.baseDir}"`,
					`ALL relative paths in this scene MUST be resolved against SCENE_DIR using absolute paths.`,
					`For example: bash "${scene.baseDir}/scripts/run.sh" — do NOT cd into the scene directory.`,
					`IMPORTANT: Use the literal path above. Do NOT use shell variables like $SCENE_DIR — no such variable exists in the shell environment.`,
					"",
					`CRITICAL: The scene directory is READ-ONLY. NEVER write, create, or modify any files inside the scene directory.`,
					`NEVER cd into the scene directory. Stay in the user's working directory (cwd) at all times.`,
					`All output files and artifacts MUST be written to cwd, NOT into the scene directory.`,
					"",
					body,
					`</scene>`,
				];

				if (tasksNote) {
					lines.push("", tasksNote);
				}

				if (args) {
					lines.push("", `User arguments: ${args}`);
				}

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
					details: { sceneName: scene.name, sceneLocation: scene.filePath },
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error reading scene "${name}" from ${scene.filePath}: ${message}`,
						},
					],
					details: { sceneName: name, sceneLocation: scene.filePath },
				};
			}
		},
	};
}
