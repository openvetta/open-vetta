import { parseInputSegments } from "./parse";
import { deriveSceneNames, deriveSkillNames, segmentsToText } from "./serialize";
import type { InputSegment, LegacyPromptRef } from "./types";

export class MultipleSceneReferencesError extends Error {
	readonly names: readonly string[];

	constructor(names: readonly string[]) {
		super(`Only one Scene can be selected per prompt: ${names.join(", ")}`);
		this.name = "MultipleSceneReferencesError";
		this.names = [...names];
	}
}

export interface PreparedInputPrompt {
	/** 发给模型的正文；已提升为 promptRef 的 scene / skill token 已剥离。 */
	readonly text: string;
	/** 要通过 PromptRequest.promptRef 强制展开的唯一 scene。 */
	readonly sceneName?: string;
	/**
	 * 无 scene 时，要把用户点选的第一个 skill 强制展开。
	 * disable-model-invocation 技能不进 invoke_skill，只认这条用户调用路径。
	 */
	readonly skillName?: string;
	/** 原始编辑态分段，供 usage/附件等派生逻辑复用。 */
	readonly segments: readonly InputSegment[];
}

function trimEdgeText(segments: readonly InputSegment[]): InputSegment[] {
	const out = segments.map((segment) => ({ ...segment }));
	const first = out[0];
	if (first?.kind === "text") {
		first.text = first.text.trimStart();
		if (first.text === "") out.shift();
	}
	const last = out.at(-1);
	if (last?.kind === "text") {
		last.text = last.text.trimEnd();
		if (last.text === "") out.pop();
	}
	return out;
}

/** 发送边界的结构化资源引用：scene 优先，否则提升第一个 skill。 */
export function preparedPromptRef(
	prepared: PreparedInputPrompt,
): { kind: "scene" | "skill"; name: string } | undefined {
	if (prepared.sceneName) return { kind: "scene", name: prepared.sceneName };
	if (prepared.skillName) return { kind: "skill", name: prepared.skillName };
	return undefined;
}

function firstSkillName(segments: readonly InputSegment[], legacyRef: LegacyPromptRef | null): string | undefined {
	const names = deriveSkillNames(segments);
	if (legacyRef?.kind === "skill" && !names.includes(legacyRef.name)) names.unshift(legacyRef.name);
	return names[0];
}

/** 将统一编辑器 Token 投影为 Runtime Prompt 合同。 */
export function prepareInputPrompt(text: string, sourceSegments?: readonly InputSegment[]): PreparedInputPrompt {
	const parsed =
		sourceSegments && segmentsToText(sourceSegments).trim() === text.trim()
			? { segments: trimEdgeText(sourceSegments), legacyRef: null }
			: parseInputSegments(text);
	const sceneNames = deriveSceneNames(parsed.segments);
	if (parsed.legacyRef?.kind === "scene" && !sceneNames.includes(parsed.legacyRef.name)) {
		sceneNames.unshift(parsed.legacyRef.name);
	}
	if (sceneNames.length > 1) throw new MultipleSceneReferencesError(sceneNames);
	const sceneName = sceneNames[0];
	if (sceneName) {
		return {
			text: segmentsToText(parsed.segments.filter((segment) => segment.kind !== "scene")).trim(),
			sceneName,
			segments: parsed.segments,
		};
	}
	const skillName = firstSkillName(parsed.segments, parsed.legacyRef);
	if (!skillName) return { text, segments: parsed.segments };
	return {
		text: segmentsToText(
			parsed.segments.filter((segment) => segment.kind !== "skill" || segment.name !== skillName),
		).trim(),
		skillName,
		segments: parsed.segments,
	};
}
