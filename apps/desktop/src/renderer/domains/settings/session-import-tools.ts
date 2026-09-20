import {
	SESSION_IMPORT_TOOLS,
	type SessionImportDirKey,
	type SessionImportEnabledKey,
	type SessionImportToolId,
} from "@/shared/session-import-tools";

export { SESSION_IMPORT_TOOLS, type SessionImportDirKey, type SessionImportEnabledKey, type SessionImportToolId };

export function isAnySessionImportEnabled(sessionImport: Record<string, unknown> | undefined): boolean {
	if (!sessionImport) return false;
	return SESSION_IMPORT_TOOLS.some((tool) => sessionImport[tool.enabledKey] === true);
}

export function firstEnabledSessionImportDirectory(input: {
	readonly sessionImport?: Record<string, unknown>;
	readonly detected?: Partial<Record<string, string>>;
}): string {
	for (const tool of SESSION_IMPORT_TOOLS) {
		if (input.sessionImport?.[tool.enabledKey] !== true) continue;
		const detected = input.detected?.[tool.id];
		const manual = input.sessionImport[tool.dirKey];
		if (typeof detected === "string" && detected) return detected;
		if (typeof manual === "string" && manual) return manual;
	}
	return "";
}
