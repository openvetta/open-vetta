import { randomUUID } from "node:crypto";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import type { WebContents } from "electron";
import type { PluginAppActionRegistration } from "../../preload/api-types/plugins.js";
import type { AppActionCatalog } from "../app-actions/catalog.js";
import { type ActionContext, ActionError, type JsonValue } from "../app-actions/types.js";
import { getAppLogger } from "../logger.js";
import { getPluginSettings, listPlugins } from "./plugin-store.js";

const REGISTER_PERMISSION = "app.actions.register";
const EXECUTE_PERMISSION = "app.actionHandler.execute";
const DEFAULT_TIMEOUT_MS = 30_000;
const ACTION_REQUEST_CHANNEL = "vetta:plugins:app-action-request";
const ACTION_CANCEL_CHANNEL = "vetta:plugins:app-action-cancel";

const log = getAppLogger("plugin-action");
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

interface RegisteredPluginAction {
	activationId: string;
	handlerId: string;
	localActionId: string;
	globalActionId: string;
	timeoutMs: number;
	unregisterCatalogAction: () => void;
}

interface PendingInvocation {
	pluginId: string;
	handlerId: string;
	timer: ReturnType<typeof setTimeout>;
	signal?: AbortSignal;
	onAbort?: () => void;
	resolve: (value: JsonValue) => void;
	reject: (error: ActionError) => void;
}

function toJsonValue(value: unknown, code: string, message: string): JsonValue {
	try {
		const serialized = JSON.stringify(value);
		if (serialized === undefined) throw new Error("Value is undefined");
		return JSON.parse(serialized) as JsonValue;
	} catch (error) {
		log.warn("JSON serialization failed", {
			code,
			error: error instanceof Error ? error.message : String(error),
		});
		throw new ActionError(code, message);
	}
}

function summarizeValidationErrors(errors: ErrorObject[] | null | undefined): JsonValue {
	return (errors ?? []).map((error) => ({
		path: error.instancePath,
		keyword: error.keyword,
		message: error.message ?? "JSON Schema validation failed",
	}));
}

function hasPermission(pluginId: string, permission: typeof REGISTER_PERMISSION | typeof EXECUTE_PERMISSION): boolean {
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	return Boolean(
		plugin?.enabled && plugin.permissions.includes(permission) && plugin.grantedPermissions.includes(permission),
	);
}

function assertPluginAvailable(pluginId: string): void {
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	if (!plugin?.enabled) {
		throw new ActionError("PLUGIN_ACTION_UNAVAILABLE", `Plugin not found or disabled: ${pluginId}`);
	}
}

function assertPluginCanRegister(pluginId: string): void {
	assertPluginAvailable(pluginId);
	if (!hasPermission(pluginId, REGISTER_PERMISSION)) {
		throw new ActionError("PLUGIN_PERMISSION_DENIED", `Plugin permission denied: ${REGISTER_PERMISSION}`);
	}
}

function assertPluginCanExecute(pluginId: string): void {
	assertPluginCanRegister(pluginId);
	if (!hasPermission(pluginId, EXECUTE_PERMISSION)) {
		throw new ActionError("PLUGIN_PERMISSION_DENIED", `Plugin permission denied: ${EXECUTE_PERMISSION}`);
	}
}

function buildGlobalActionId(pluginId: string, localActionId: string): string {
	return `plugin.${pluginId}.${localActionId}`;
}

export class PluginActionService {
	private readonly activations = new Map<string, string>();
	private readonly actions = new Map<string, Map<string, RegisteredPluginAction>>();
	private readonly pendingInvocations = new Map<string, PendingInvocation>();

	constructor(
		private readonly webContents: WebContents,
		private readonly catalog: AppActionCatalog,
	) {}

	beginLoad(pluginId: string, activationId: string): void {
		assertPluginAvailable(pluginId);
		this.clearPlugin(pluginId, undefined, "Plugin action activation was replaced");
		this.activations.set(pluginId, activationId);
		log.info("activation began", { pluginId, activationId });
	}

	register(pluginId: string, registration: PluginAppActionRegistration): void {
		assertPluginCanExecute(pluginId);
		const currentActivationId = this.activations.get(pluginId);
		if (!currentActivationId || registration.activationId !== currentActivationId) {
			throw new ActionError("PLUGIN_ACTION_STALE_ACTIVATION", `Stale plugin action activation: ${pluginId}`);
		}

		const pluginActions = this.actions.get(pluginId) ?? new Map<string, RegisteredPluginAction>();
		if (pluginActions.has(registration.id)) {
			throw new ActionError(
				"PLUGIN_ACTION_DUPLICATE",
				`Plugin action is already registered: ${pluginId}/${registration.id}`,
			);
		}

		const inputSchema = toJsonValue(
			registration.inputSchema,
			"PLUGIN_ACTION_SCHEMA_INVALID",
			`Plugin action schema is not JSON serializable: ${pluginId}/${registration.id}`,
		);
		let validateInput: ValidateFunction<unknown>;
		try {
			validateInput = ajv.compile(inputSchema as object);
		} catch (error) {
			throw new ActionError(
				"PLUGIN_ACTION_SCHEMA_INVALID",
				`Invalid JSON Schema for plugin action ${pluginId}/${registration.id}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}

		const examples = registration.examples.map((example) => ({
			description: example.description,
			input: toJsonValue(
				example.input,
				"PLUGIN_ACTION_SCHEMA_INVALID",
				`Plugin action example is not JSON serializable: ${pluginId}/${registration.id}`,
			),
		}));
		const globalActionId = buildGlobalActionId(pluginId, registration.id);
		const registered: RegisteredPluginAction = {
			activationId: registration.activationId,
			handlerId: registration.handlerId,
			localActionId: registration.id,
			globalActionId,
			timeoutMs: registration.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			unregisterCatalogAction: () => {},
		};

		registered.unregisterCatalogAction = this.catalog.register({
			id: globalActionId,
			domain: `plugin.${pluginId}`,
			title: registration.title,
			summary: registration.summary,
			availability: "gui-renderer",
			permission: `plugin.${pluginId}.app-action.${registration.effect}`,
			keywords: registration.keywords,
			approval:
				registration.effect === "read"
					? undefined
					: {
							defaultPresentation: "generic",
							presentations: [
								{
									id: "generic",
									title: registration.title,
									description: registration.description ?? registration.summary,
								},
							],
						},
			inputSchema: {
				description: registration.description ?? registration.summary,
				jsonSchema: inputSchema,
			},
			examples,
			validateInput: (input) => {
				const normalizedInput = toJsonValue(
					input,
					"ACTION_INVALID_INPUT",
					`Input is not JSON serializable for ${globalActionId}`,
				);
				if (!validateInput(normalizedInput)) {
					throw new ActionError("ACTION_INVALID_INPUT", `Input must match the ${globalActionId} schema.`, {
						issues: summarizeValidationErrors(validateInput.errors),
					});
				}
				return normalizedInput;
			},
			requiresApproval:
				registration.effect === "read" ? undefined : (_input, context) => context.source === "local-server",
			run: (input, context) => this.invoke(pluginId, registered, input, context),
		});

		pluginActions.set(registration.id, registered);
		this.actions.set(pluginId, pluginActions);
		log.info("action registered", {
			pluginId,
			localActionId: registration.id,
			globalActionId,
			activationId: registration.activationId,
			effect: registration.effect,
		});
	}

	unregister(pluginId: string, localActionId: string, activationId?: string): void {
		if (activationId && this.activations.get(pluginId) !== activationId) return;
		const pluginActions = this.actions.get(pluginId);
		const action = pluginActions?.get(localActionId);
		if (!action || (activationId && action.activationId !== activationId)) return;
		action.unregisterCatalogAction();
		pluginActions?.delete(localActionId);
		if (pluginActions?.size === 0) this.actions.delete(pluginId);
		this.cancelInvocations(pluginId, action.handlerId, "Plugin action was unregistered");
		log.info("action unregistered", { pluginId, localActionId, activationId });
	}

	clear(pluginId: string, activationId?: string): void {
		if (activationId && this.activations.get(pluginId) !== activationId) return;
		this.clearPlugin(pluginId, activationId, "Plugin action activation was cleared");
	}

	respond(requestId: string, result: unknown): void {
		const pending = this.pendingInvocations.get(requestId);
		if (!pending) return;
		this.detachPending(requestId, pending);
		if (typeof result === "object" && result !== null && "error" in result) {
			pending.reject(
				new ActionError(
					"PLUGIN_ACTION_FAILED",
					String((result as { error?: unknown }).error ?? "Plugin action failed"),
				),
			);
			return;
		}
		try {
			const value =
				typeof result === "object" && result !== null && "value" in result
					? (result as { value?: unknown }).value
					: result;
			pending.resolve(
				toJsonValue(value, "ACTION_SERIALIZE_ERROR", "Plugin action result must be JSON serializable."),
			);
		} catch (error) {
			pending.reject(
				error instanceof ActionError
					? error
					: new ActionError("ACTION_SERIALIZE_ERROR", "Plugin action result must be JSON serializable."),
			);
		}
	}

	dispose(): void {
		for (const pluginId of [...this.actions.keys()]) {
			this.clearPlugin(pluginId, undefined, "Plugin action service was disposed");
		}
		for (const [requestId, pending] of this.pendingInvocations) {
			this.cancelPending(requestId, pending, "Plugin action service was disposed");
		}
		this.activations.clear();
	}

	private invoke(
		pluginId: string,
		action: RegisteredPluginAction,
		input: JsonValue,
		context: ActionContext,
	): Promise<JsonValue> {
		assertPluginCanExecute(pluginId);
		if (
			this.activations.get(pluginId) !== action.activationId ||
			this.actions.get(pluginId)?.get(action.localActionId) !== action
		) {
			throw new ActionError(
				"PLUGIN_ACTION_UNAVAILABLE",
				`Plugin action is no longer registered: ${action.globalActionId}`,
			);
		}
		if (this.webContents.isDestroyed()) {
			throw new ActionError("PLUGIN_ACTION_UNAVAILABLE", "Plugin host renderer is unavailable");
		}

		return new Promise<JsonValue>((resolve, reject) => {
			const requestId = randomUUID();
			const pending: PendingInvocation = {
				pluginId,
				handlerId: action.handlerId,
				timer: setTimeout(() => {
					this.cancelPending(requestId, pending, `Plugin action timed out after ${action.timeoutMs}ms`, true);
				}, action.timeoutMs),
				signal: context.signal,
				resolve,
				reject,
			};
			pending.onAbort = () => this.cancelPending(requestId, pending, "Plugin action invocation was aborted", true);
			if (context.signal?.aborted) {
				this.cancelPending(requestId, pending, "Plugin action invocation was aborted", false);
				return;
			}
			context.signal?.addEventListener("abort", pending.onAbort, { once: true });
			this.pendingInvocations.set(requestId, pending);
			try {
				this.webContents.send(ACTION_REQUEST_CHANNEL, {
					requestId,
					pluginId,
					actionId: action.globalActionId,
					localActionId: action.localActionId,
					handlerId: action.handlerId,
					settings: getPluginSettings(pluginId),
					input,
				});
			} catch (error) {
				this.detachPending(requestId, pending);
				reject(
					new ActionError(
						"PLUGIN_ACTION_UNAVAILABLE",
						error instanceof Error ? error.message : "Failed to invoke plugin action",
					),
				);
			}
		});
	}

	private clearPlugin(pluginId: string, activationId: string | undefined, reason: string): void {
		const pluginActions = this.actions.get(pluginId);
		if (pluginActions) {
			for (const action of pluginActions.values()) action.unregisterCatalogAction();
			this.actions.delete(pluginId);
		}
		this.cancelInvocations(pluginId, undefined, reason);
		if (!activationId || this.activations.get(pluginId) === activationId) this.activations.delete(pluginId);
		log.info("plugin actions cleared", { pluginId, activationId });
	}

	private cancelInvocations(pluginId: string, handlerId: string | undefined, reason: string): void {
		for (const [requestId, pending] of this.pendingInvocations) {
			if (pending.pluginId !== pluginId || (handlerId && pending.handlerId !== handlerId)) continue;
			this.cancelPending(requestId, pending, reason, true);
		}
	}

	private cancelPending(requestId: string, pending: PendingInvocation, reason: string, notifyRenderer = false): void {
		if (this.pendingInvocations.get(requestId) === pending) this.detachPending(requestId, pending);
		else clearTimeout(pending.timer);
		if (notifyRenderer && !this.webContents.isDestroyed()) {
			try {
				this.webContents.send(ACTION_CANCEL_CHANNEL, { requestId });
			} catch (error) {
				log.debug("failed to notify renderer about action cancellation", {
					requestId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		pending.reject(
			new ActionError(reason.includes("timed out") ? "PLUGIN_ACTION_TIMEOUT" : "ACTION_ABORTED", reason),
		);
	}

	private detachPending(requestId: string, pending: PendingInvocation): void {
		this.pendingInvocations.delete(requestId);
		clearTimeout(pending.timer);
		if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
	}
}
