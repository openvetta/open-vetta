export const SESSION_IMPORT_TOOLS = [
	{ id: "grok", enabledKey: "grokEnabled", dirKey: "grokSessionDir", nameKey: "agentSettings.sessionImport.grok" },
	{
		id: "claude-code",
		enabledKey: "claudeCodeEnabled",
		dirKey: "claudeCodeSessionDir",
		nameKey: "agentSettings.sessionImport.claudeCode",
	},
	{ id: "codex", enabledKey: "codexEnabled", dirKey: "codexSessionDir", nameKey: "agentSettings.sessionImport.codex" },
	{
		id: "cursor-agent",
		enabledKey: "cursorAgentEnabled",
		dirKey: "cursorAgentSessionDir",
		nameKey: "agentSettings.sessionImport.cursorAgent",
	},
	{ id: "pi", enabledKey: "piEnabled", dirKey: "piSessionDir", nameKey: "agentSettings.sessionImport.pi" },
	{ id: "omp", enabledKey: "ompEnabled", dirKey: "ompSessionDir", nameKey: "agentSettings.sessionImport.omp" },
] as const;

export type SessionImportToolId = (typeof SESSION_IMPORT_TOOLS)[number]["id"];
export type SessionImportEnabledKey = (typeof SESSION_IMPORT_TOOLS)[number]["enabledKey"];
export type SessionImportDirKey = (typeof SESSION_IMPORT_TOOLS)[number]["dirKey"];
