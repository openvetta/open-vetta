import type { PluginOfficialApi, PluginOfficialWebhookEndpoint } from "@vetta-org/plugin-sdk";

function requireWebhookEndpoint(
	result: Awaited<ReturnType<typeof window.vetta.webhook.create>>,
): PluginOfficialWebhookEndpoint {
	if (!result.ok || !result.endpoint) throw new Error(result.error ?? "Webhook operation failed");
	return result.endpoint;
}

export function createOfficialWebhookApi(assertOfficial: () => void): PluginOfficialApi["webhook"] {
	return {
		list: async () => {
			assertOfficial();
			return window.vetta.webhook.list();
		},
		listProviders: async () => {
			assertOfficial();
			return window.vetta.webhook.listProviders();
		},
		create: async (input) => {
			assertOfficial();
			return requireWebhookEndpoint(await window.vetta.webhook.create(input));
		},
		update: async (id, input) => {
			assertOfficial();
			return requireWebhookEndpoint(await window.vetta.webhook.update(id, input));
		},
		setEnabled: async (id, enabled) => {
			assertOfficial();
			return requireWebhookEndpoint(await window.vetta.webhook.toggle(id, enabled));
		},
		delete: async (id) => {
			assertOfficial();
			await window.vetta.webhook.delete(id);
		},
		test: async (id) => {
			assertOfficial();
			return window.vetta.webhook.test(id);
		},
		send: async (id, message) => {
			assertOfficial();
			return window.vetta.webhook.send(id, message);
		},
	};
}
