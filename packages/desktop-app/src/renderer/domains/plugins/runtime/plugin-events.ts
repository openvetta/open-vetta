export const PLUGINS_CHANGED_EVENT = "vetta:plugins-changed";

let resolvePluginHostReady: (() => void) | undefined;
let pluginHostReadyPromise = new Promise<void>((resolve) => {
	resolvePluginHostReady = resolve;
});

export function notifyPluginsChanged(): void {
	window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));
}

export function markPluginHostLoading(): void {
	pluginHostReadyPromise = new Promise<void>((resolve) => {
		resolvePluginHostReady = resolve;
	});
}

export function markPluginHostReady(): void {
	resolvePluginHostReady?.();
	resolvePluginHostReady = undefined;
}

export async function waitForPluginHostReady(timeoutMs = 5000): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			pluginHostReadyPromise,
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
