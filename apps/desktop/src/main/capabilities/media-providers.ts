import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import { type Disposable, DOMAIN_MEDIA_CAPABILITIES } from "@vetta-org/capability-sdk";
import { isCloudBuildEnabled } from "../../shared/feature-flags.js";
import type { ArtifactStore } from "../artifacts/artifact-store.js";
import type { JobManager } from "../jobs/job-manager.js";
import { getAppLogger } from "../logger.js";
import { CustomImageProviderManager } from "../media-generation/custom-image-provider-manager.js";
import { MediaArtifactStore } from "../media-generation/media-artifact-store.js";
import { MediaProviderRegistry } from "../media-generation/media-provider-registry.js";
import { createVettaImageProvider } from "../media-generation/vetta-image-provider.js";

const DOMAIN_MEDIA_PROVIDER_OWNER = "vetta.domain.media";

export interface DesktopMediaRuntime {
	readonly providers: MediaProviderRegistry;
	readonly artifacts: MediaArtifactStore;
	/** 用户自配的 OpenAI 兼容图片服务（ADR-0141）；IPC 通过它增删改。 */
	readonly customImageProviders: CustomImageProviderManager;
}

// 走 Chromium 网络栈，跟随应用代理设置；lazy import 让本模块在无 electron 的单测里可加载。
const electronFetch = async (url: string, init: RequestInit): Promise<Response> => {
	const { net } = await import("electron");
	return net.fetch(url, init);
};

let desktopMediaRuntime: DesktopMediaRuntime | undefined;

export function getDesktopMediaRuntime(): DesktopMediaRuntime {
	if (!desktopMediaRuntime) throw new Error("Desktop media runtime is not initialized");
	return desktopMediaRuntime;
}

export function registerDesktopMediaProviders(
	registry: CapabilityRegistry,
	artifactStore: ArtifactStore,
	jobs: JobManager,
): Disposable {
	const providers = new MediaProviderRegistry(jobs, getAppLogger("media-generation"));
	const artifacts = new MediaArtifactStore(artifactStore);
	const customImageProviders = new CustomImageProviderManager(providers, artifacts, { fetch: electronFetch });
	desktopMediaRuntime = { providers, artifacts, customImageProviders };
	// Vetta 图像生成走云端网关：lite 构建不注册，provider 列表中不出现。
	const vettaRegistration = isCloudBuildEnabled()
		? providers.registerProvider(createVettaImageProvider(artifacts))
		: undefined;
	const capabilityRegistration = registry.registerOwner(DOMAIN_MEDIA_PROVIDER_OWNER, [
		bindCapability(DOMAIN_MEDIA_CAPABILITIES.LIST_PROVIDERS, {
			execute: async () => providers.listProviders(),
		}),
		bindCapability(DOMAIN_MEDIA_CAPABILITIES.SUBMIT, {
			execute: (input, context) => providers.submit(input, context.signal),
		}),
	]);
	return {
		dispose: () => {
			if (desktopMediaRuntime?.providers === providers) desktopMediaRuntime = undefined;
			capabilityRegistration.dispose();
			customImageProviders.dispose();
			vettaRegistration?.dispose();
		},
	};
}
