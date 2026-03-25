import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { loginDialogOpenAtom } from "@shared/store/atoms";
import { fetchOAuthProviders, fetchOAuthURL } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";

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
	const [providers, setProviders] = useState<string[]>([]);
	const [loading, setLoading] = useState<string | null>(null);
	const [account, setAccount] = useState("");
	const [password, setPassword] = useState("");

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

	function handleAccountLogin(e: React.FormEvent) {
		e.preventDefault();
		// TODO: account/password login not implemented yet
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
						className="relative w-[360px] overflow-hidden rounded-xl border border-[var(--popup-border)] bg-[var(--popup-bg)] p-6"
						style={{ boxShadow: "var(--popup-shadow)" }}
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="mb-5 text-center">
							<h2 className="text-[15px] font-semibold text-[var(--text-1)]">
								Login
							</h2>
							<p className="mt-1 text-[12px] text-[var(--text-2)]">
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
								className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition focus:border-[var(--accent-glow)]"
							/>
							<input
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition focus:border-[var(--accent-glow)]"
							/>
							<button
								type="submit"
								className="h-9 w-full rounded-lg bg-[var(--accent)] text-[13px] font-medium text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
							>
								Login
							</button>
						</form>

						{/* Divider */}
						{providers.length > 0 && (
							<div className="my-5 flex items-center gap-3">
								<div className="h-px flex-1 bg-[var(--popup-separator)]" />
								<span className="text-[11px] text-[var(--text-3)]">OR</span>
								<div className="h-px flex-1 bg-[var(--popup-separator)]" />
							</div>
						)}

						{/* OAuth providers */}
						{providers.length > 0 && (
							<div className="space-y-2">
								{providers.map((p) => {
									const meta = PROVIDER_META[p] ?? {
										label: p,
										icon: "icon-[mdi--login]",
										color: "hover:bg-[var(--hover-strong)]",
									};
									return (
										<button
											key={p}
											type="button"
											disabled={loading === p}
											onClick={() => void handleOAuth(p)}
											className={cn(
												"flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-transparent text-[13px] font-medium text-[var(--text-1)] transition",
												meta.color,
												loading === p && "opacity-50",
											)}
										>
											<span className={cn(meta.icon, "h-4 w-4")} />
											{loading === p ? "Redirecting..." : meta.label}
										</button>
									);
								})}
							</div>
						)}

						{/* Close button */}
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="absolute right-3 top-3 rounded-md p-1 text-[var(--text-3)] transition hover:bg-[var(--hover)] hover:text-[var(--text-1)]"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</button>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
