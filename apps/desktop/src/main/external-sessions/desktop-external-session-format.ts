import { createDesktopExternalSessionFormat, type DesktopExternalSessionFormat } from "@vetta/runtime-desktop";
import { resolveGrokSessionsListDirectory } from "./resolve-grok-sessions-list-directory.js";

let format: DesktopExternalSessionFormat | undefined;

export function getDesktopExternalSessionFormat(): DesktopExternalSessionFormat {
	format ??= createDesktopExternalSessionFormat({
		resolveSessionsDirectory: resolveGrokSessionsListDirectory,
	});
	return format;
}
