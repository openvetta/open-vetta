import {
	createGreenfieldKnowledgeProcessingSessionFactory,
	createLegacyKnowledgeProcessingSessionFactory,
	type KnowledgeProcessingSessionFactory,
} from "@vetta/coding-agent/composition";
import type { ModelRegistry } from "@vetta/coding-agent/legacy/host-services";
import type { DesktopAgentRuntimeBackend } from "../greenfield-runtime/desktop-runtime-selector.js";

export interface DesktopKnowledgeProcessingSessionFactoryOptions {
	readonly backend: DesktopAgentRuntimeBackend;
	readonly getModelRegistry: () => ModelRegistry;
}

/**
 * Knowledge Processing 复用 Desktop 的进程级 Runtime 选择，但保留自己的产品组合边界。
 * 未显式 opt-in 时上游 selector 返回 Legacy；这里不再读取环境变量或重复解析配置。
 */
export function createDesktopKnowledgeProcessingSessionFactory(
	options: DesktopKnowledgeProcessingSessionFactoryOptions,
): KnowledgeProcessingSessionFactory {
	if (options.backend === "greenfield") {
		return createGreenfieldKnowledgeProcessingSessionFactory({
			getModelRegistry: options.getModelRegistry,
		});
	}
	return createLegacyKnowledgeProcessingSessionFactory({
		getModelRegistry: options.getModelRegistry,
	});
}
