/** First-run setup wizard completion — show once, skip/finish both write this. */
export const SETUP_WIZARD_STORAGE_KEY = "vetta-setup-wizard-completed";

export const SETUP_WIZARD_COMPLETED_EVENT = "vetta-setup-wizard-completed";

/**
 * Signals that the user already used the app before this wizard shipped.
 * Avoid forcing the wizard on upgrade installs.
 * Keys must only appear after real prior usage (not set on brand-new first launch).
 */
const PRIOR_USAGE_STORAGE_KEYS = [
	"vetta.tour.sidebar.completed",
	"vetta.tour.capabilities.completed",
	"vetta-last-active-session",
] as const;

function hasPriorAppUsage(): boolean {
	return PRIOR_USAGE_STORAGE_KEYS.some((key) => {
		try {
			const value = localStorage.getItem(key);
			return value != null && value !== "";
		} catch {
			return false;
		}
	});
}

export function isSetupWizardCompleted(): boolean {
	try {
		if (localStorage.getItem(SETUP_WIZARD_STORAGE_KEY) === "1") return true;
		// Upgrade path: existing users skip the first-run wizard once.
		if (hasPriorAppUsage()) {
			localStorage.setItem(SETUP_WIZARD_STORAGE_KEY, "1");
			return true;
		}
		return false;
	} catch {
		// Private mode / blocked storage: treat as completed so we do not loop.
		return true;
	}
}

export function markSetupWizardCompleted(): void {
	try {
		localStorage.setItem(SETUP_WIZARD_STORAGE_KEY, "1");
	} catch {
		// ignore quota / private mode
	}
	window.dispatchEvent(new Event(SETUP_WIZARD_COMPLETED_EVENT));
}
