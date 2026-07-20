import { isMac } from "@shared/lib/platform";

export type SetupWizardStepId = "permissions" | "languageAppearance" | "login" | "welcome";

/** macOS: 4 steps (permissions first); other platforms: 3 steps. */
export function getSetupWizardSteps(): readonly SetupWizardStepId[] {
	if (isMac) {
		return ["permissions", "languageAppearance", "login", "welcome"] as const;
	}
	return ["languageAppearance", "login", "welcome"] as const;
}
