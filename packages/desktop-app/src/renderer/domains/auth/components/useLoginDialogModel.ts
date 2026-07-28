import { loginByAccount } from "@shared/lib/api";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "@shared/store/atoms";
import { useAtom, useSetAtom } from "jotai";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LoginDialogViewProps } from "./LoginDialogView";

export type LoginDialogModel = LoginDialogViewProps;

export function useLoginDialogModel(): LoginDialogModel {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(loginDialogOpenAtom);
	const setToken = useSetAtom(authTokenAtom);
	const setUser = useSetAtom(authUserAtom);
	const [oauthLoading, setOauthLoading] = useState(false);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");

	async function handleOAuthLogin() {
		setOauthLoading(true);
		try {
			const siteUrl = await window.vetta.settings.getSiteUrl();
			const loginUrl = `${siteUrl}/auth/deep-link?client_redirect=${encodeURIComponent("vetta://oauth/callback")}`;
			await window.vetta.auth.openExternal(loginUrl);
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

	return {
		account,
		labels: {
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
		},
		loginError,
		loginLoading,
		oauthLoading,
		onAccountChange: setAccount,
		onClose: () => setOpen(false),
		onOAuthLogin: () => void handleOAuthLogin(),
		onPasswordChange: setPassword,
		onSubmit: handleAccountLogin,
		open,
		password,
	};
}
