import { loginByAccount } from "@shared/lib/api";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom, useSetAtom } from "jotai";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoginDialogView } from "./LoginDialogView";

function deriveSiteUrl(serverUrl: string): string {
	try {
		const url = new URL(serverUrl);
		// 本地开发：API 在 8080，站点在 3000
		if (url.port === "8080") url.port = "3000";
		// 生产环境：去 api. 前缀（api.vetta.ai → vetta.ai）
		if (url.hostname.startsWith("api.")) url.hostname = url.hostname.slice(4);
		return url.origin;
	} catch {
		return serverUrl.replace(":8080", ":3000");
	}
}

export function LoginDialog(): JSX.Element {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(loginDialogOpenAtom);
	const setToken = useSetAtom(authTokenAtom);
	const setUser = useSetAtom(authUserAtom);
	const [oauthLoading, setOauthLoading] = useState(false);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");
	const ThemedLoginDialogView = useThemeComponent("root.loginDialogView", LoginDialogView);

	async function handleOAuthLogin() {
		setOauthLoading(true);
		try {
			const serverUrl = await window.vetta.settings.getServerUrl();
			const siteUrl = deriveSiteUrl(serverUrl);
			// vetta:// 协议由 main.ts 通过 app.setAsDefaultProtocolClient("vetta") 注册
			const loginUrl = `${siteUrl}/auth/deep-link?client_redirect=${encodeURIComponent("vetta://oauth/callback")}`;
			await window.vetta.auth.openExternal(loginUrl);
			// 浏览器打开后等用户完成 OAuth 并通过 deep link 返回
			// 回调由 useAuth 的 onOAuthCallback 处理，这里不关 dialog
		} catch (e) {
			console.error("OAuth site login error:", e);
		} finally {
			setOauthLoading(false);
		}
	}

	async function handleAccountLogin(e: FormEvent) {
		e.preventDefault();
		if (!account || !password) return;
		setLoginLoading(true);
		setLoginError("");
		try {
			const data = await loginByAccount(account, password);
			const access = data.access_token ?? data.token;
			setToken(access);
			localStorage.setItem("vetta-auth-token", access);
			if (data.refresh_token) {
				localStorage.setItem("vetta-refresh-token", data.refresh_token);
				void window.vetta.settings.setServerRefreshToken(data.refresh_token);
			}
			setUser(data.user);
			void window.vetta.settings.setServerToken(access);
			setOpen(false);
		} catch (err) {
			setLoginError(err instanceof Error ? err.message : t("loginDialog.error"));
		} finally {
			setLoginLoading(false);
		}
	}

	return (
		<ThemedLoginDialogView
			account={account}
			labels={{
				accountPlaceholder: t("loginDialog.accountPlaceholder"),
				close: t("actions.close"),
				footerHint: t("loginDialog.footerHint"),
				login: t("loginDialog.login"),
				loggingIn: t("loginDialog.loggingIn"),
				oauthButton: t("loginDialog.oauthButton"),
				oauthDivider: t("loginDialog.oauthDivider"),
				passwordPlaceholder: t("loginDialog.passwordPlaceholder"),
				subtitle: t("loginDialog.subtitle"),
				title: t("loginDialog.title"),
			}}
			loginError={loginError}
			loginLoading={loginLoading}
			oauthLoading={oauthLoading}
			onAccountChange={setAccount}
			onClose={() => setOpen(false)}
			onOAuthLogin={() => void handleOAuthLogin()}
			onPasswordChange={setPassword}
			onSubmit={handleAccountLogin}
			open={open}
			password={password}
		/>
	);
}
