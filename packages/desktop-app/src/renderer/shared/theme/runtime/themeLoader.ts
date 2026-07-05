import { createInstance, type ModuleFederation } from "@module-federation/enhanced/runtime";
import type { DesktopThemePackage } from "@preload/api";
import type { ThemeModule } from "@vetta/theme-sdk";
import { createThemeRuntimeShared } from "./themeSharedModules";

interface ThemeModuleExports {
	default?: ThemeModule;
	theme?: ThemeModule;
}

let host: ModuleFederation | undefined;
const registeredEntries = new Map<string, string>();

function getHost(): ModuleFederation {
	host ??= createInstance({
		name: "vetta_theme_host",
		remotes: [],
		shared: createThemeRuntimeShared(),
		shareStrategy: "loaded-first",
	});
	return host;
}

function loadStyles(theme: DesktopThemePackage): () => void {
	const elements = theme.styleUrls.map((url) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = url;
		link.dataset.themePackage = theme.id;
		document.head.append(link);
		return link;
	});
	return () => {
		for (const element of elements) element.remove();
	};
}

export async function loadThemePackage(theme: DesktopThemePackage): Promise<{ module: ThemeModule; dispose(): void }> {
	const federationHost = getHost();
	const remote = {
		name: theme.moduleFederation.remoteName,
		alias: theme.id,
		entry: theme.entryUrl,
	};
	const previousEntry = registeredEntries.get(remote.name);
	federationHost.registerRemotes(
		[remote],
		previousEntry === undefined ? undefined : { force: previousEntry !== remote.entry },
	);
	registeredEntries.set(remote.name, remote.entry);
	const expose = theme.moduleFederation.expose.replace(/^\.\//, "");
	const exports = await federationHost.loadRemote<ThemeModuleExports>(`${remote.name}/${expose}`, { from: "runtime" });
	const module = exports?.default ?? exports?.theme;
	if (!module || module.meta?.id !== theme.id) {
		throw new Error(`Theme module "${theme.id}" did not export a matching ThemeModule`);
	}
	const disposeStyles = loadStyles(theme);
	return { module, dispose: disposeStyles };
}
