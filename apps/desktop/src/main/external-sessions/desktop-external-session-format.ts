import { createDesktopExternalSessionFormat, type DesktopExternalSessionFormat } from "@vetta/runtime-desktop";
import { resolveExternalSessionRoots } from "./resolve-grok-sessions-list-directory.js";

let format: DesktopExternalSessionFormat | undefined;

export function getDesktopExternalSessionFormat(): DesktopExternalSessionFormat {
	format ??= createDesktopExternalSessionFormat({
		resolveSessionRoots: resolveExternalSessionRoots,
	});
	return format;
}
