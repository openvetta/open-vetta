import { useState, useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "@shared/store/atoms";
import { fetchOAuthProviders, fetchOAuthURL, loginByAccount } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";

const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
	github: {
		label: "GitHub",
		icon: "icon-[mdi--github]",
		color: "hover:bg-[#24292e] hover:text-white",
	},
	wechat: {
		label: "WeChat",
		icon: "icon-[mdi--wechat]",
		color: "hover:bg-[#07c160] hover:text-white",
	},
	dingtalk: {
		label: "DingTalk",
		icon: "icon-[mdi--message-text]",
		color: "hover:bg-[#0089ff] hover:text-white",
	},
};

export function LoginDialog(): JSX.Element {
	const [open, setOpen] = useAtom(loginDialogOpenAtom);
	const setToken = useSetAtom(authTokenAtom);
	const setUser = useSetAtom(authUserAtom);
	const [providers, setProviders] = useState<string[]>([]);
	const [loading, setLoading] = useState<string | null>(null);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");

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

	async function handleAccountLogin(e: React.FormEvent) {
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
			setLoginError(err instanceof Error ? err.message : "登录失败");
		} finally {
			setLoginLoading(false);
		}
	}

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="fixed inset-0 z-50 flex items-center justify-center"
					onClick={() => setOpen(false)}
				>
					{/* Backdrop */}
					<div className="absolute inset-0 bg-black/50" />

					{/* Dialog */}
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 8 }}
						transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
						className="relative w-[360px] overflow-hidden rounded-xl border border-border bg-popover p-6 shadow-xl"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="mb-5 text-center">
							<h2 className="text-[15px] font-semibold text-foreground">
								Login
							</h2>
							<p className="mt-1 text-[12px] text-muted-foreground">
								Sign in to your account
							</p>
						</div>

						{/* Account/Password form */}
						<form onSubmit={handleAccountLogin} className="space-y-3">
							<input
								type="text"
								placeholder="Account"
								value={account}
								onChange={(e) => setAccount(e.target.value)}
								className="h-9 w-full rounded-lg border border-input bg-muted px-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition focus:border-ring/50"
							/>
							<input
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="h-9 w-full rounded-lg border border-input bg-muted px-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition focus:border-ring/50"
							/>
							{loginError && (
								<p className="text-[12px] text-destructive">{loginError}</p>
							)}
							<Button type="submit" className="w-full" disabled={loginLoading}>
								{loginLoading ? "Logging in..." : "Login"}
							</Button>
						</form>

						{/* Divider */}
						{providers.length > 0 && (
							<div className="my-5 flex items-center gap-3">
								<div className="h-px flex-1 bg-border" />
								<span className="text-[11px] text-muted-foreground/50">OR</span>
								<div className="h-px flex-1 bg-border" />
							</div>
						)}

						{/* OAuth providers */}
						{providers.length > 0 && (
							<div className="space-y-2">
								{providers.map((p) => {
									const meta = PROVIDER_META[p] ?? {
										label: p,
										icon: "icon-[mdi--login]",
										color: "hover:bg-accent",
									};
									return (
										<Button
											key={p}
											variant="outline"
											disabled={loading === p}
											onClick={() => void handleOAuth(p)}
											className={cn("w-full", meta.color, loading === p && "opacity-50")}
										>
											<span className={cn(meta.icon, "h-4 w-4")} />
											{loading === p ? "Redirecting..." : meta.label}
										</Button>
									);
								})}
							</div>
						)}

						{/* Close button */}
						<Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} className="absolute right-3 top-3">
							<span className="icon-[mdi--close] h-4 w-4" />
						</Button>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
