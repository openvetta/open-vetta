import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type Disposable,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
} from "@vetta/capability-sdk";
import { readDesktopConfig, writeDesktopConfig } from "../config/desktop-config-store.js";
import { listRuntimeSessionProjects, listSessionHistory } from "../conversations/session-query-service.js";
import { allowProjectRoot, createFilesystemDirectory } from "../filesystem/filesystem-service.js";
import { ProjectService } from "../projects/project-service.js";

const DOMAIN_PROJECT_PROVIDER_OWNER = "vetta.domain.project";
const DOMAIN_SESSION_PROVIDER_OWNER = "vetta.domain.session";

function assertNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.ABORTED, "Capability invocation was aborted");
	}
}

export function registerDesktopDomainProviders(registry: CapabilityRegistry): Disposable {
	const projects = new ProjectService({
		allowProjectRoot,
		createDirectory: createFilesystemDirectory,
		readConfig: readDesktopConfig,
		writeConfig: writeDesktopConfig,
	});
	const projectRegistration = registry.registerOwner(DOMAIN_PROJECT_PROVIDER_OWNER, [
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.LIST, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return projects.list();
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.CREATE, {
			execute: async ({ name, path }, context) => {
				assertNotAborted(context.signal);
				return projects.create(name, path);
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.OPEN, {
			execute: async ({ path, name }, context) => {
				assertNotAborted(context.signal);
				return projects.open(path, name);
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.RENAME, {
			execute: async ({ path, name }, context) => {
				assertNotAborted(context.signal);
				return projects.rename(path, name);
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.ARCHIVE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				await projects.archive(path);
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.UNARCHIVE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				await projects.unarchive(path);
			},
		}),
		bindCapability(DOMAIN_PROJECT_CAPABILITIES.REMOVE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				await projects.remove(path);
			},
		}),
	]);
	const sessionRegistration = registry.registerOwner(DOMAIN_SESSION_PROVIDER_OWNER, [
		bindCapability(DOMAIN_SESSION_CAPABILITIES.LIST, {
			execute: async ({ cwd }, context) => {
				assertNotAborted(context.signal);
				return listSessionHistory(cwd);
			},
		}),
		bindCapability(DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return listRuntimeSessionProjects();
			},
		}),
	]);
	return {
		dispose: () => {
			sessionRegistration.dispose();
			projectRegistration.dispose();
		},
	};
}
