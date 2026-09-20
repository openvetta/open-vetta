import { SESSION_IMPORT_TOOLS, type SessionImportToolId } from "../../shared/session-import-tools.js";
import type { SessionImportConfig } from "../config/desktop-config-store.js";

export { SESSION_IMPORT_TOOLS, type SessionImportToolId };

export function isSessionImportToolEnabled(
	config: SessionImportConfig | undefined,
	tool: SessionImportToolId,
): boolean {
	const spec = SESSION_IMPORT_TOOLS.find((item) => item.id === tool);
	return spec ? config?.[spec.enabledKey] === true : false;
}

export function sessionImportManualDirectory(
	config: SessionImportConfig | undefined,
	tool: SessionImportToolId,
): string | undefined {
	const spec = SESSION_IMPORT_TOOLS.find((item) => item.id === tool);
	if (!spec) return undefined;
	const value = config?.[spec.dirKey];
	return typeof value === "string" && value.trim() ? value : undefined;
}

export function isAnySessionImportEnabled(config: SessionImportConfig | undefined): boolean {
	return SESSION_IMPORT_TOOLS.some((tool) => config?.[tool.enabledKey] === true);
}
