import type { ImageContent } from "@vetta/ai";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { ExtensionRunner } from "../../core/extensions/runner.js";
import type { InputEventResult, InputSource } from "../../core/extensions/types.js";
import { wrapRuntimeToolsWithExtensions } from "./greenfield-extension-tool-wrapper.js";

/**
 * Session 级 Extension 事件桥。
 *
 * Composition Root 在 Session 构建时持有桥，宿主随后绑定 Runner；因此 Prompt 与
 * Tool Frame 只依赖稳定桥接口，不依赖 CLI 生命周期或 Extension Loader。
 */
export class CodingAgentGreenfieldExtensionEventBridge {
	private runner: ExtensionRunner | undefined;
	private systemPrompt = "";

	bind(runner: ExtensionRunner): () => void {
		if (this.runner && this.runner !== runner) {
			throw new Error("Greenfield Extension event bridge is already bound");
		}
		this.runner = runner;
		return () => {
			if (this.runner === runner) this.runner = undefined;
		};
	}

	async interceptInput(
		text: string,
		images: ImageContent[] | undefined,
		source: InputSource,
	): Promise<InputEventResult> {
		return this.runner?.emitInput(text, images, source) ?? { action: "continue" };
	}

	wrapTools(tools: ReadonlyMap<string, RuntimeToolDefinition>): ReadonlyMap<string, RuntimeToolDefinition> {
		return this.runner ? wrapRuntimeToolsWithExtensions(tools, this.runner) : tools;
	}

	recordSystemPrompt(systemPrompt: string): void {
		this.systemPrompt = systemPrompt;
	}

	readSystemPrompt(): string {
		return this.systemPrompt;
	}
}
