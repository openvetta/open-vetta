import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PetApp } from "./domains/pet/components/PetApp";
import { applyInitialTheme, applyStoredTheme, MODE_STORAGE_KEY, THEME_STORAGE_KEY } from "./shared/theme/apply";
import "./styles.css";

applyInitialTheme();

window.addEventListener("storage", (event) => {
	if (event.key !== MODE_STORAGE_KEY && event.key !== THEME_STORAGE_KEY) return;
	applyStoredTheme();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	if (localStorage.getItem(MODE_STORAGE_KEY) === "auto") {
		applyStoredTheme();
	}
});

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<StrictMode>
		<PetApp />
	</StrictMode>,
);
