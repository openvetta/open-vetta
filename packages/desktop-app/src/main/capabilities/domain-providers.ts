import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type Disposable,
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
	DOMAIN_WEBHOOK_CAPABILITIES,
} from "@vetta/capability-sdk";
import { readDesktopConfig, writeDesktopConfig } from "../config/desktop-config-store.js";
import { listRuntimeSessionProjects, listSessionHistory } from "../conversations/session-query-service.js";
import { getDesktopDownloadService } from "../downloads/download-service.js";
import { allowProjectRoot, createFilesystemDirectory } from "../filesystem/filesystem-service.js";
import { ProjectService } from "../projects/project-service.js";
import { getDesktopSchedulerService } from "../scheduler/scheduler-service.js";
import { getWebhookManager } from "../webhook/index.js";

const DOMAIN_PROJECT_PROVIDER_OWNER = "vetta.domain.project";
const DOMAIN_SESSION_PROVIDER_OWNER = "vetta.domain.session";
const DOMAIN_DOWNLOAD_PROVIDER_OWNER = "vetta.domain.download";
const DOMAIN_SCHEDULER_PROVIDER_OWNER = "vetta.domain.scheduler";
const DOMAIN_WEBHOOK_PROVIDER_OWNER = "vetta.domain.webhook";

function assertNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.ABORTED, "Capability invocation was aborted");
	}
}

export function registerDesktopDomainProviders(registry: CapabilityRegistry): Disposable {
	const downloads = getDesktopDownloadService();
	const scheduler = getDesktopSchedulerService();
	const webhooks = getWebhookManager();
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
	const downloadRegistration = registry.registerOwner(DOMAIN_DOWNLOAD_PROVIDER_OWNER, [
		bindCapability(DOMAIN_DOWNLOAD_CAPABILITIES.LIST, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return downloads.list();
			},
		}),
		bindCapability(DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL, {
			execute: async ({ id }, context) => {
				assertNotAborted(context.signal);
				downloads.cancel(id);
			},
		}),
	]);
	const schedulerRegistration = registry.registerOwner(DOMAIN_SCHEDULER_PROVIDER_OWNER, [
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.LIST_TASKS, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return scheduler.listTasks();
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.GET_TASK, {
			execute: async ({ taskId }, context) => {
				assertNotAborted(context.signal);
				return scheduler.getTask(taskId);
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY, {
			execute: async ({ taskId }, context) => {
				assertNotAborted(context.signal);
				return scheduler.getHistory(taskId);
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK, {
			execute: async ({ data }, context) => {
				assertNotAborted(context.signal);
				return scheduler.createTask({ ...data });
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK, {
			execute: async ({ taskId, data }, context) => {
				assertNotAborted(context.signal);
				return scheduler.updateTask(taskId, { ...data });
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.DELETE_TASK, {
			execute: async ({ taskId }, context) => {
				assertNotAborted(context.signal);
				return scheduler.deleteTask(taskId);
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.SET_ENABLED, {
			execute: async ({ taskId, enabled }, context) => {
				assertNotAborted(context.signal);
				return scheduler.setEnabled(taskId, enabled);
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.RUN_TASK, {
			execute: async ({ taskId }, context) => {
				assertNotAborted(context.signal);
				return scheduler.runNow(taskId);
			},
		}),
		bindCapability(DOMAIN_SCHEDULER_CAPABILITIES.ABORT_TASK, {
			execute: async ({ taskId }, context) => {
				assertNotAborted(context.signal);
				return scheduler.abort(taskId);
			},
		}),
	]);
	const webhookRegistration = registry.registerOwner(DOMAIN_WEBHOOK_PROVIDER_OWNER, [
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.LIST_ENDPOINTS, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return webhooks.list();
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.LIST_PROVIDERS, {
			execute: async (_input, context) => {
				assertNotAborted(context.signal);
				return webhooks.listProviderDescriptors();
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT, {
			execute: async ({ data }, context) => {
				assertNotAborted(context.signal);
				return webhooks.create({ ...data });
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT, {
			execute: async ({ id, data }, context) => {
				assertNotAborted(context.signal);
				return webhooks.update(id, { ...data });
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.DELETE_ENDPOINT, {
			execute: async ({ id }, context) => {
				assertNotAborted(context.signal);
				webhooks.delete(id);
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.SET_ENABLED, {
			execute: async ({ id, enabled }, context) => {
				assertNotAborted(context.signal);
				return webhooks.setEnabled(id, enabled);
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.TEST_ENDPOINT, {
			execute: async ({ id }, context) => {
				assertNotAborted(context.signal);
				return webhooks.test(id);
			},
		}),
		bindCapability(DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE, {
			execute: async ({ id, message }, context) => {
				assertNotAborted(context.signal);
				return webhooks.send(id, { ...message });
			},
		}),
	]);
	return {
		dispose: () => {
			webhookRegistration.dispose();
			schedulerRegistration.dispose();
			downloadRegistration.dispose();
			sessionRegistration.dispose();
			projectRegistration.dispose();
		},
	};
}
