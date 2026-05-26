import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { applyInitialTheme } from "./shared/theme/apply";
import "./styles.css";

// 必须在 React 挂载前同步注入主题变量，避免冷启动闪烁。
applyInitialTheme();

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
