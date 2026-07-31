import type { ModelRegistry } from "@vetta/coding-agent/host-services";
import { createLegacyRuntimeHostOptions } from "@vetta/coding-agent/runtime-host";
import type {
	RuntimeHostOptions,
	RuntimeHostSessionBackend,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
	RuntimeSharedModelController,
} from "../../../../runtime-core/src/index.js";

export interface DesktopLegacyRuntimeCompatibilityOptions {
	readonly additionalSkillPaths: string[];
	readonly getDefaultExecutionMode: NonNullable<RuntimeHostOptions["getDefaultExecutionMode"]>;
	readonly linuxBubblewrapPath: string | undefined;
	readonly macosSandboxExecPath: string | undefined;
	readonly modelRegistry: ModelRegistry;
	readonly sandboxHostPath: string | undefined;
	readonly serverUrl: string;
	readonly userQuestionHandler: NonNullable<RuntimeHostOptions["userQuestionHandler"]>;
}

export interface DesktopLegacyRuntimeCompatibility {
	readonly sessionBackend: RuntimeHostSessionBackend;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
	readonly sharedModelController: RuntimeSharedModelController | undefined;
}

/**
 * Legacy 只在这个兼容边界内组装。Desktop 主 Composition Root 只消费明确列出的
 * Backend/Catalog/History/Model Port，不再把整包 Legacy options 当作基础配置展开。
 */
export function createDesktopLegacyRuntimeCompatibility(
	options: DesktopLegacyRuntimeCompatibilityOptions,
): DesktopLegacyRuntimeCompatibility {
	const legacy = createLegacyRuntimeHostOptions(options);
	if (!legacy.sessionBackend || !legacy.sessionCatalog || !legacy.sessionFileHistoryReader) {
		throw new Error("Legacy RuntimeHost compatibility must provide session services");
	}
	return {
		sessionBackend: legacy.sessionBackend,
		sessionCatalog: legacy.sessionCatalog,
		sessionFileHistoryReader: legacy.sessionFileHistoryReader,
		sharedModelController: legacy.sharedModelController,
	};
}
