import { fetchOAuthProviders, fetchOAuthURL, loginByAccount } from "@shared/lib/api";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom, useSetAtom } from "jotai";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoginDialogView } from "./LoginDialogView";

export function LoginDialog(): JSX.Element {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(loginDialogOpenAtom);
	const setToken = useSetAtom(authTokenAtom);
	const setUser = useSetAtom(authUserAtom);
	const [providers, setProviders] = useState<string[]>([]);
	const [loading, setLoading] = useState<string | null>(null);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");
	const ThemedLoginDialogView = useThemeComponent("root.loginDialogView", LoginDialogView);

	useEffect(() => {
		if (open) {
			void fetchOAuthProviders()
				.then(setProviders)
				.catch(() => setProviders([]));
		}
	}, [open]);

	async function handleOAuth(provider: string) {
		setLoading(provider);
		try {
			const url = await fetchOAuthURL(provider);
			await window.vetta.auth.openExternal(url);
		} catch (e) {
			console.error("OAuth error:", e);
		} finally {
			setLoading(null);
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
			// 远程模型 / credits 拉取由 useAuth 在 token 变化时统一负责
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
				oauthDivider: t("loginDialog.oauthDivider"),
				passwordPlaceholder: t("loginDialog.passwordPlaceholder"),
				subtitle: t("loginDialog.subtitle"),
				title: t("loginDialog.title"),
			}}
			loadingProvider={loading}
			loginError={loginError}
			loginLoading={loginLoading}
			onAccountChange={setAccount}
			onClose={() => setOpen(false)}
			onOAuth={(provider) => void handleOAuth(provider)}
			onPasswordChange={setPassword}
			onSubmit={handleAccountLogin}
			open={open}
			password={password}
			providers={providers}
		/>
	);
}
