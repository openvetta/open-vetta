export const PLUGINS_CHANGED_EVENT = "vetta:plugins-changed";

export function notifyPluginsChanged(): void {
	window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));
}
