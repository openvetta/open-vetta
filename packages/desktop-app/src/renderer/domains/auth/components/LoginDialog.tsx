import { useState, useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "@shared/store/atoms";
import { fetchOAuthProviders, fetchOAuthURL, loginByAccount } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";
import { BotAvatar } from "@shared/components/BotAvatar";

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
	github: {
		label: "GitHub",
		icon: "icon-[mdi--github]",
	},
	wechat: {
		label: "WeChat",
		icon: "icon-[mdi--wechat]",
	},
	dingtalk: {
		label: "DingTalk",
		icon: "icon-[mdi--message-text]",
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
					<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

					{/* Dialog */}
					<motion.div
						initial={{ opacity: 0, scale: 0.97, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.97, y: 8 }}
						transition={{ type: "spring", stiffness: 300, damping: 26 }}
						className="relative w-[380px] overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-lg backdrop-blur-md"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Decorative top accent */}
						<div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />

						{/* Close button */}
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setOpen(false)}
							className="absolute right-3 top-3 z-10"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</Button>

						<div className="relative px-6 pb-6 pt-7">
							{/* Header with brand mark */}
							<div className="mb-6 flex flex-col items-center text-center">
								<div className="mb-3 flex items-center justify-center">
									<BotAvatar size="md" autoplay />
								</div>
								<h2 className="text-[15px] font-semibold text-foreground">
									登录 Vetta
								</h2>
								<p className="mt-1 text-[12px] text-muted-foreground">
									使用账号或第三方平台继续
								</p>
							</div>

							{/* Account/Password form */}
							<form onSubmit={handleAccountLogin} className="space-y-2.5">
								<div className="relative">
									<span className="icon-[mdi--account-outline] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
									<input
										type="text"
										placeholder="账号"
										value={account}
										onChange={(e) => setAccount(e.target.value)}
										className="h-10 w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition-colors hover:border-border focus:border-primary/40 focus:bg-muted/60 focus:ring-1 focus:ring-inset focus:ring-primary/20"
									/>
								</div>
								<div className="relative">
									<span className="icon-[mdi--lock-outline] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
									<input
										type="password"
										placeholder="密码"
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
											<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5" />
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
											<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
											登录中...
										</>
									) : (
										"登录"
									)}
								</Button>
							</form>

							{/* Divider */}
							{providers.length > 0 && (
								<div className="my-5 flex items-center gap-3">
									<div className="h-px flex-1 bg-border/60" />
									<span className="text-[11px] text-muted-foreground/60">
										或使用第三方登录
									</span>
									<div className="h-px flex-1 bg-border/60" />
								</div>
							)}

							{/* OAuth providers */}
							{providers.length > 0 && (
								<div className={cn("grid gap-2", providers.length > 1 ? "grid-cols-3" : "grid-cols-1")}>
									{providers.map((p) => {
										const meta = PROVIDER_META[p] ?? {
											label: p,
											icon: "icon-[mdi--login]",
										};
										const isLoading = loading === p;
										return (
											<button
												key={p}
												type="button"
												disabled={isLoading}
												onClick={() => void handleOAuth(p)}
												title={meta.label}
												className={cn(
													"group flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 text-[12px] text-muted-foreground transition-colors",
													"hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
													isLoading && "opacity-50",
												)}
											>
												{isLoading ? (
													<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
												) : (
													<>
														<span className={cn(meta.icon, "h-4 w-4")} />
														{providers.length <= 2 && (
															<span>{meta.label}</span>
														)}
													</>
												)}
											</button>
										);
									})}
								</div>
							)}

							{/* Footer hint */}
							<p className="mt-5 text-center text-[11px] text-muted-foreground/60">
								登录即表示同意服务条款与隐私政策
							</p>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
