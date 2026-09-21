/**
 * Rank the model a plugin AI call should use when the caller omitted `modelKey`.
 * Prefers the user's configured default when that key is currently usable;
 * otherwise the first credentialed text model. Matches coding-agent session
 * and "continue from" fallback so chat can work without models.json defaultModel.
 */
export function pickFallbackAiModelKey(
	configuredDefault: string | null | undefined,
	credentialedKeys: readonly string[],
): string | undefined {
	const configured = configuredDefault?.trim();
	if (configured && credentialedKeys.includes(configured)) return configured;
	return credentialedKeys[0];
}
