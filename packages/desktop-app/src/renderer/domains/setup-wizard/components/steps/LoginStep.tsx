import { loginByAccount } from "@shared/lib/api";
import { authTokenAtom, authUserAtom } from "@shared/store/atoms";
import { Button } from "@vetta/ui";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface LoginStepProps {
	/** 账号登录或 OAuth 成功后步进到下一步，不展示成功态。 */
	onSuccess: () => void;
}

export function LoginStep({ onSuccess }: LoginStepProps): JSX.Element {
	const { t } = useTranslation("common");
	const token = useAtomValue(authTokenAtom);
	const [, setUser] = useAtom(authUserAtom);
	const [, setToken] = useAtom(authTokenAtom);
	const [oauthLoading, setOauthLoading] = useState(false);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");
	const advancedRef = useRef(false);

	// 登录成功（含 OAuth 回跳写 token）后直接下一步；已登录进入本步也跳过表单。
	useEffect(() => {
		if (!token || advancedRef.current) return;
		advancedRef.current = true;
		onSuccess();
	}, [token, onSuccess]);

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
			// token 写入后由上面 useEffect 统一 next，避免重复步进。
		} catch (err) {
			setLoginError(err instanceof Error ? err.message : t("loginDialog.error"));
		} finally {
			setLoginLoading(false);
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-[340px] flex-col gap-5">
			<div className="text-center">
				<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border/50 bg-card/40">
					<span className="icon-[solar--user-circle-linear] h-6 w-6 text-primary" />
				</div>
				<h2 className="text-[15px] font-semibold text-foreground">{t("setupWizard.login.title")}</h2>
				<p className="mt-1 text-[12px] text-muted-foreground">{t("setupWizard.login.subtitle")}</p>
			</div>

			<form onSubmit={(e) => void handleAccountLogin(e)} className="space-y-2.5">
				<div className="relative">
					<span className="icon-[solar--user-linear] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
					<input
						type="text"
						placeholder={t("loginDialog.accountPlaceholder")}
						value={account}
						onChange={(e) => setAccount(e.target.value)}
						className="h-10 w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition-colors hover:border-border focus:border-primary/40 focus:bg-muted/60 focus:ring-1 focus:ring-inset focus:ring-primary/20"
					/>
				</div>
				<div className="relative">
					<span className="icon-[solar--lock-password-linear] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
					<input
						type="password"
						placeholder={t("loginDialog.passwordPlaceholder")}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="h-10 w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition-colors hover:border-border focus:border-primary/40 focus:bg-muted/60 focus:ring-1 focus:ring-inset focus:ring-primary/20"
					/>
				</div>
				<AnimatePresence>
					{loginError && (
						<motion.p
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							className="flex items-center gap-1.5 text-[12px] text-destructive"
						>
							<span className="icon-[solar--danger-circle-linear] h-3.5 w-3.5" />
							{loginError}
						</motion.p>
					)}
				</AnimatePresence>
				<Button
					type="submit"
					className="mt-1 h-10 w-full rounded-lg text-[13px]"
					disabled={loginLoading || !account || !password}
				>
					{loginLoading ? (
						<>
							<span className="icon-[solar--refresh-linear] h-4 w-4 animate-spin" />
							{t("loginDialog.loggingIn")}
						</>
					) : (
						t("loginDialog.login")
					)}
				</Button>
			</form>

			<div className="flex items-center gap-3">
				<div className="h-px flex-1 bg-border/60" />
				<span className="text-[11px] text-muted-foreground/60">{t("loginDialog.oauthDivider")}</span>
				<div className="h-px flex-1 bg-border/60" />
			</div>

			<Button
				variant="outline"
				className="h-10 w-full rounded-lg text-[13px]"
				disabled={oauthLoading}
				onClick={() => void handleOAuthLogin()}
			>
				{oauthLoading ? (
					<>
						<span className="icon-[solar--refresh-linear] h-4 w-4 animate-spin" />
						{t("loginDialog.loggingIn")}
					</>
				) : (
					<span className="flex items-center gap-2">
						<span className="icon-[solar--login-2-linear] h-4 w-4" />
						{t("loginDialog.oauthButton")}
					</span>
				)}
			</Button>

			<p className="text-center text-[11px] text-muted-foreground/70">{t("setupWizard.login.optionalHint")}</p>
		</div>
	);
}
