import { definePlugin } from "@vetta/plugin-sdk";
import { ACTIVITY_TAB_ID, INPUT_ACTION_ID, SAVE_TOOL_ID } from "./constants";
import { IconLottie } from "./icons";
import { LottieFilePreview } from "./LottieFilePreview";
import { LottieStudioPanel } from "./LottieStudioPanel";
import { readMeta, slugify, validateLottie } from "./lottie";
import { FEW_SHOT_EXAMPLE, SAVE_TOOL_DESCRIPTION } from "./prompt";
import { focusAnimation, pluginContext, setPluginContext } from "./store";
import { ToolResultCard } from "./ToolResultCard";
import type { ControlHint } from "./types";
import "./style.css";

interface SaveInput {
	sourcePath: string;
	name?: string;
	outputPath?: string;
	controls?: ControlHint[];
}

interface SaveResult {
	ok: boolean;
	path?: string;
	name?: string;
	frames?: number;
	slots?: number;
	error?: string;
}

// ─── Path helpers (renderer has no node:path; paths are absolute OS paths) ───

function sepOf(p: string): string {
	return p.includes("\\") && !p.includes("/") ? "\\" : "/";
}
function dirnameOf(p: string): string {
	const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	return idx >= 0 ? p.slice(0, idx) : ".";
}
function basenameOf(p: string): string {
	return p.split(/[\\/]/).pop() ?? p;
}
function joinPath(dir: string, child: string): string {
	const sep = sepOf(dir);
	return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${child}` : `${dir}${sep}${child}`;
}

/** Decide where the .lottie lands: explicit outputPath, else slug next to the draft. */
function resolveOutputPath(input: SaveInput): string {
	if (input.outputPath && input.outputPath.trim()) {
		const out = input.outputPath.trim();
		return out.toLowerCase().endsWith(".lottie") ? out : `${out}.lottie`;
	}
	const dir = dirnameOf(input.sourcePath);
	const fallback = basenameOf(input.sourcePath).replace(/\.(draft\.)?json$/i, "");
	const slug = slugify(input.name?.trim() || fallback);
	return joinPath(dir, `${slug}.lottie`);
}

export default definePlugin({
	activate(ctx) {
		// Never nulled in deactivate(): under StrictMode the host double-invokes
		// load/dispose; a racing deactivate could null the ctx live components read.
		setPluginContext(ctx);

		ctx.ui.registerInputAction({
			id: INPUT_ACTION_ID,
			label: "Lottie",
			icon: <IconLottie className="h-3.5 w-3.5" />,
			scope_use: ["conversation", "project"],
			requiresActiveTool: SAVE_TOOL_ID,
			decoratePrompt: () => ({ metadata: { lottieMode: true } }),
		});

		ctx.agent.registerTool<SaveInput>({
			id: SAVE_TOOL_ID,
			name: SAVE_TOOL_ID,
			label: "保存 Lottie 动画",
			description: `${SAVE_TOOL_DESCRIPTION}\n\n${FEW_SHOT_EXAMPLE}`,
			scope_use: ["conversation", "project"],
			parameters: {
				type: "object",
				properties: {
					sourcePath: {
						type: "string",
						description: "草稿 bodymovin JSON 文件的绝对路径（你先用文件写入工具写好它）。",
					},
					name: {
						type: "string",
						description: "动画的人类可读名称，用于生成文件名 slug 与面板展示。",
					},
					outputPath: {
						type: "string",
						description: "可选。要覆盖的已存在 .lottie 文件的绝对路径（编辑现有动画时用）。",
					},
					controls: {
						type: "array",
						description: "可选。slot 的 UI 提示（标签 / scalar 滑块范围）。",
						items: {
							type: "object",
							properties: {
								sid: { type: "string" },
								label: { type: "string" },
								min: { type: "number" },
								max: { type: "number" },
								step: { type: "number" },
							},
							required: ["sid"],
						},
					},
				},
				required: ["sourcePath"],
			},
			handler: async (input, api): Promise<SaveResult> => {
				if (!input?.sourcePath) return { ok: false, error: "缺少 sourcePath。" };
				let raw: string;
				try {
					raw = (await api.fs.readFile(input.sourcePath)).content;
				} catch (err) {
					return { ok: false, error: `读取草稿失败：${(err as Error).message}` };
				}
				const validation = validateLottie(raw);
				if (!validation.ok || !validation.doc) return { ok: false, error: validation.error };

				const doc = validation.doc;
				if (Array.isArray(input.controls) && input.controls.length > 0) {
					doc.metadata ??= {};
					doc.metadata.lottieStudio ??= {};
					doc.metadata.lottieStudio.controls = input.controls;
				}

				const outputPath = resolveOutputPath(input);
				try {
					await api.fs.writeFile(outputPath, JSON.stringify(doc));
				} catch (err) {
					return { ok: false, error: `写入失败：${(err as Error).message}` };
				}
				if (outputPath !== input.sourcePath) {
					try {
						await api.fs.delete(input.sourcePath);
					} catch {
						/* draft cleanup is best-effort */
					}
				}

				const meta = readMeta(doc);
				const slots = doc.slots ? Object.keys(doc.slots).length : 0;
				const name = input.name?.trim() || basenameOf(outputPath).replace(/\.lottie$/i, "");

				focusAnimation(outputPath);
				pluginContext()?.ui.openActivityTab(ACTIVITY_TAB_ID);

				return { ok: true, path: outputPath, name, frames: meta.totalFrames, slots };
			},
		});

		ctx.ui.registerToolCallSlot({
			id: "save-result",
			toolName: SAVE_TOOL_ID,
			component: ToolResultCard,
		});

		ctx.ui.registerActivityTab({
			id: ACTIVITY_TAB_ID,
			label: "Lottie Studio",
			icon: <IconLottie className="h-4 w-4" />,
			component: LottieStudioPanel,
			scope_use: ["conversation", "project"],
		});

		ctx.ui.registerFilePreview({
			extensions: ["lottie"],
			component: LottieFilePreview,
		});
	},
});
