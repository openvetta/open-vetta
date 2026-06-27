import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { router } from "./router";
import { i18n, initI18n } from "./shared/i18n";
import { applyInitialTheme } from "./shared/theme/apply";
import { applyStoredCustomCursor } from "./shared/theme/cursor";
import "./styles.css";

// 必须在 React 挂载前同步注入主题变量，避免冷启动闪烁。
applyInitialTheme();
// 同步应用鼠标指针偏好（默认关闭），避免开启后冷启动出现原生光标闪烁。
applyStoredCustomCursor();
// 同理：挂载前同步初始化 i18next（资源已内联，无 async），避免界面文案闪烁。
initI18n();

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<StrictMode>
		<I18nextProvider i18n={i18n}>
			<RouterProvider router={router} />
		</I18nextProvider>
	</StrictMode>,
);
