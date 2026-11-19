import { isMac } from "@shared/lib/platform";

export type SetupWizardStepId = "permissions" | "languageAppearance" | "welcome";

/** macOS: language/appearance → permissions → welcome; other platforms skip permissions. */
export function getSetupWizardSteps(): readonly SetupWizardStepId[] {
	return isMac ? ["languageAppearance", "permissions", "welcome"] : ["languageAppearance", "welcome"];
}
