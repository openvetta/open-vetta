import { BotAvatar } from "@shared/components/BotAvatar";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { Button } from "@vetta/ui";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";

export interface LoginDialogViewLabels {
	readonly accountPlaceholder: string;
	readonly close: string;
	readonly footerHint: string;
	readonly login: string;
	readonly loggingIn: string;
	readonly oauthButton: string;
	readonly oauthDivider: string;
	readonly passwordPlaceholder: string;
	readonly subtitle: string;
	readonly title: string;
}

export interface LoginDialogViewProps {
	readonly account: string;
	readonly labels: LoginDialogViewLabels;
	readonly loginError: string;
	readonly loginLoading: boolean;
	readonly oauthLoading: boolean;
	readonly onAccountChange: (value: string) => void;
	readonly onClose: () => void;
	readonly onOAuthLogin: () => void;
	readonly onPasswordChange: (value: string) => void;
	readonly onSubmit: (event: FormEvent) => void;
	readonly open: boolean;
	readonly password: string;
}

export function LoginDialogView({
	account,
	labels,
	loginError,
	loginLoading,
	oauthLoading,
	onAccountChange,
	onClose,
	onOAuthLogin,
	onPasswordChange,
	onSubmit,
	open,
	password,
}: LoginDialogViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="fixed inset-0 z-50 flex items-center justify-center"
					onClick={onClose}
				>
					<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

					<motion.div
						initial={{ opacity: 0, scale: 0.97, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.97, y: 8 }}
						transition={{ type: "spring", stiffness: 300, damping: 26 }}
						className="relative w-[380px] overflow-visible rounded-2xl border border-border/60 bg-card/95 shadow-lg backdrop-blur-md"
						onClick={(e) => e.stopPropagation()}
					>
						<ThemeSurface slot="root.loginDialog.panel" />
						<div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />

						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onClose}
							title={labels.close}
							className="absolute right-3 top-3 z-20"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</Button>

						<div className="relative z-10 px-6 pb-6 pt-7">
							<div className="mb-6 flex flex-col items-center text-center">
								<div className="mb-3 flex items-center justify-center">
									<BotAvatar size="md" autoplay />
								</div>
								<h2 className="text-[15px] font-semibold text-foreground">{labels.title}</h2>
								<p className="mt-1 text-[12px] text-muted-foreground">{labels.subtitle}</p>
							</div>

							<form onSubmit={onSubmit} className="space-y-2.5">
								<div className="relative">
									<span className="icon-[mdi--account-outline] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
									<input
										type="text"
										placeholder={labels.accountPlaceholder}
										value={account}
										onChange={(e) => onAccountChange(e.target.value)}
										className="h-10 w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-3 text-[13px] text-foreground placeholder-muted-foreground/50 outline-none transition-colors hover:border-border focus:border-primary/40 focus:bg-muted/60 focus:ring-1 focus:ring-inset focus:ring-primary/20"
									/>
								</div>
								<div className="relative">
									<span className="icon-[mdi--lock-outline] pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
									<input
										type="password"
										placeholder={labels.passwordPlaceholder}
										value={password}
										onChange={(e) => onPasswordChange(e.target.value)}
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
											{labels.loggingIn}
										</>
									) : (
										labels.login
									)}
								</Button>
							</form>

							<div className="my-5 flex items-center gap-3">
								<div className="h-px flex-1 bg-border/60" />
								<span className="text-[11px] text-muted-foreground/60">{labels.oauthDivider}</span>
								<div className="h-px flex-1 bg-border/60" />
							</div>

							<Button
								variant="outline"
								className="h-10 w-full rounded-lg text-[13px]"
								disabled={oauthLoading}
								onClick={onOAuthLogin}
							>
								{oauthLoading ? (
									<>
										<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
										{labels.loggingIn}
									</>
								) : (
									<span className="flex items-center gap-2">
										<span className="icon-[mdi--login] h-4 w-4" />
										{labels.oauthButton}
									</span>
								)}
							</Button>

							<p className="mt-5 text-center text-[11px] text-muted-foreground/60">{labels.footerHint}</p>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
