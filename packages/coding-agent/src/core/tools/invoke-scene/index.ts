import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { stripFrontmatter } from "../../../utils/frontmatter.js";
import type { Skill } from "../../skills.js";
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

				const lines: string[] = [
					`<scene name="${scene.name}" location="${scene.filePath}">`,
					"",
					`SCENE_DIR="${scene.baseDir}"`,
					"ALL relative paths in this scene MUST be resolved against SCENE_DIR above.",
					'When running bash commands from this scene, ALWAYS prefix with: cd "$SCENE_DIR" &&',
					"",
					body,
					`</scene>`,
				];

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
