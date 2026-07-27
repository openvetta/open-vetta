import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { router } from "./router";
import { i18n, initI18n } from "./shared/i18n";
import { applyInitialTheme } from "./shared/theme/apply";
import { applyStoredCursorStyle } from "./shared/theme/cursor";
import { desktopThemeHost } from "./shared/theme/desktopThemeHost";
import { ThemeRuntimeProvider } from "./shared/theme/runtime";
import { ThemeColorOverrideBridge } from "./shared/theme/ThemeColorOverrideBridge";
import { ThemeHostProvider } from "@vetta/theme-sdk";
import { registerCapabilityDetailI18n } from "./domains/skills/detail/register-capability-detail-i18n";
import { captureReactError, initializeRendererErrorMonitoring } from "./telemetry/error-monitoring";
import { initializeProductAnalytics } from "./telemetry/product-analytics";
import "./styles.css";

initializeRendererErrorMonitoring("main");
initializeProductAnalytics();

// 必须在 React 挂载前同步注入主题变量，避免冷启动闪烁。
applyInitialTheme();
// 同步应用鼠标指针样式（默认系统指针），避免白鼬样式冷启动出现原生光标闪烁。
applyStoredCursorStyle();
// 同理：挂载前同步初始化 i18next（资源已内联，无 async），避免界面文案闪烁。
initI18n();
registerCapabilityDetailI18n(i18n);

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement, { onCaughtError: captureReactError, onRecoverableError: captureReactError }).render(
	<StrictMode>
		<I18nextProvider i18n={i18n}>
			<ThemeHostProvider host={desktopThemeHost}>
				<ThemeRuntimeProvider>
					<ThemeColorOverrideBridge />
					<RouterProvider router={router} />
				</ThemeRuntimeProvider>
			</ThemeHostProvider>
		</I18nextProvider>
	</StrictMode>,
);
