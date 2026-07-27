import type { i18n as I18nInstance } from "i18next";
import { capabilityDetailDocuments } from "./documents";

export function registerCapabilityDetailI18n(i18n: I18nInstance): void {
	for (const language of ["zh", "en"] as const) {
		const documents = Object.fromEntries(
			capabilityDetailDocuments.map((document) => [document.id, document.messages[language]]),
		);
		i18n.addResourceBundle(language, "skills", { capabilities: { detail: { documents } } }, true, true);
	}
}
