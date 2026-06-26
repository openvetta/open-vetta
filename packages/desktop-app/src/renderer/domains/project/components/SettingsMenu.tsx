import { useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "@shared/hooks/useTheme";
import { useAuth } from "@domains/auth/hooks/useAuth";
import { creditsBalanceAtom, creditsUnlimitedAtom, subscriptionStatusAtom } from "@shared/store/auth-atoms";
import { downloadsActiveCountAtom, themeModeAtom, loginDialogOpenAtom, type ThemeMode } from "@shared/store/atoms";
import { Popover, PopoverTrigger, PopoverContent } from "@shared/components/ui/popover";
import { UserAvatar } from "@shared/components/UserAvatar";
import { cn } from "@shared/lib/utils";
import { formatResetCountdown } from "@shared/lib/subscription-format";
import { useTranslation } from "react-i18next";

const itemVariants = {
	hidden: { opacity: 0, x: -12 },
	show: { opacity: 1, x: 0 },
};

const dividerVariants = {
	hidden: { opacity: 0, scaleX: 0.9 },
	show: { opacity: 1, scaleX: 1 },
};

export function SettingsMenu(): JSX.Element {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);
	const mode = useAtomValue(themeModeAtom);
	const activeDownloads = useAtomValue(downloadsActiveCountAtom);
	const { setMode } = useTheme();
	const navigate = useNavigate();
	const setLoginOpen = useSetAtom(loginDialogOpenAtom);
	const { user, logout } = useAuth();
	const creditsBalance = useAtomValue(creditsBalanceAtom);
	const creditsUnlimited = useAtomValue(creditsUnlimitedAtom);
	const subscription = useAtomValue(subscriptionStatusAtom);
	const setCreditsBalance = useSetAtom(creditsBalanceAtom);
	const setCreditsUnlimited = useSetAtom(creditsUnlimitedAtom);
	const setSubscriptionStatus = useSetAtom(subscriptionStatusAtom);

	// popover 打开时重新拉取额度/订阅，保证展示的是最新消耗值（消息消耗后无主动 invalidate）。
	const handleOpenChange = (next: boolean): void => {
		setOpen(next);
		if (next && user) {
			void window.vetta.credits
				.getBalance()
				.then((result) => {
					setCreditsBalance(result.balance);
					setCreditsUnlimited(result.unlimited ?? false);
				})
				.catch(console.error);
			void window.vetta.subscription
				.getStatus()
				.then((result) => {
					if (result.status) setSubscriptionStatus(result.status);
				})
				.catch(console.error);
		}
	};

	// 后台开启 Vetta Go 时，头像挂会员标志，并在展开后展示 5 小时额度。
	const goEnabled = subscription.go_enabled;
	const fiveHourWindowRaw = goEnabled ? subscription.windows?.find((w) => w.kind === "5h") : undefined;
	// 无限制套餐(limit<=0)不展示额度进度。
	const fiveHourWindow = fiveHourWindowRaw && fiveHourWindowRaw.limit > 0 ? fiveHourWindowRaw : undefined;
	// 展示剩余额度百分比（100% 满额 → 0% 用尽），比已消耗更符合直觉。
	const fiveHourRemainingPercent = fiveHourWindow
		? Math.max(0, Math.min(100, Math.round((1 - fiveHourWindow.consumed / fiveHourWindow.limit) * 100)))
		: 0;

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-[12px] font-medium transition-colors",
						open
							? "bg-accent text-foreground"
							: "text-foreground hover:bg-accent/50",
					)}
				>
					{user ? (
						<>
							<UserAvatar
								avatar={user.avatar}
								nickname={user.nickname}
								username={user.username}
								className="h-4 w-4 shrink-0"
								textClassName="text-[9px]"
							/>
							<span className="truncate">{user.nickname || user.username}</span>
							{goEnabled && (
								<span
									className="inline-flex shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none text-white"
									style={{ backgroundColor: subscription.badge_color || "#f59e0b" }}
									title={subscription.tier_name || "Vetta Go"}
								>
									{subscription.badge_text || subscription.tier_name || "Go"}
								</span>
							)}
						</>
					) : (
						<>
							<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
							{t("sidebar.settings")}
						</>
					)}
				</button>
			</PopoverTrigger>
			<AnimatePresence>
				{open && (
					<PopoverContent
						forceMount
						asChild
						side="top"
						align="start"
						sideOffset={6}
						className="w-[180px] gap-0 overflow-hidden rounded-lg border border-border p-1"
						style={{ animation: "none" }}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 8 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 8 }}
							transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
						>
					<motion.div
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
						}}
						initial="hidden"
						animate="show"
					>
						{/* Theme section */}
						<motion.div variants={itemVariants}>
							<div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1.5">
								<div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
									<span className="icon-[solar--palette-linear] h-3.5 w-3.5" />
									<span>{t("theme.title")}</span>
								</div>
								<div className="flex items-center gap-0.5 rounded-md bg-accent/60 p-0.5">
									{[
										{ value: "light" as ThemeMode, label: t("theme.light"), icon: "icon-[solar--sun-linear]" },
										{ value: "dark" as ThemeMode, label: t("theme.dark"), icon: "icon-[solar--moon-linear]" },
										{ value: "system" as ThemeMode, label: t("theme.system"), icon: "icon-[solar--laptop-linear]" },
									].map((opt) => (
										<button
											key={opt.value}
											type="button"
											title={opt.label}
											aria-label={opt.label}
											aria-pressed={mode === opt.value}
											onClick={(event: MouseEvent<HTMLButtonElement>) => {
												void setMode(opt.value, {
													x: event.clientX,
													y: event.clientY,
												});
											}}
											className={cn(
												"flex h-5 w-6 items-center justify-center rounded-[4px] transition-colors",
												mode === opt.value
													? "bg-primary text-primary-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											<span className={cn(opt.icon, "h-3.5 w-3.5")} />
										</button>
									))}
								</div>
							</div>
						</motion.div>

						{/* Credits balance: credits are Vetta Zen billing, hidden when Zen is disabled */}
						{user && subscription.zen_enabled && (creditsBalance !== null || creditsUnlimited) && (
							<motion.div key="credits" variants={itemVariants}>
								<div className="mx-1 my-1 border-t border-border" />
								<div className="mx-2 my-1.5 flex items-center justify-between rounded-md bg-accent/50 px-2 py-1.5">
									<div className="flex items-center gap-1.5">
										<span className="icon-[solar--wallet-linear] h-3.5 w-3.5 text-muted-foreground" />
										<span className="text-[11px] text-muted-foreground">{t("sidebar.creditsRemaining")}</span>
									</div>
									{creditsUnlimited ? (
										<span className="text-[12px] font-semibold text-primary">
											{t("sidebar.creditsUnlimited")}
										</span>
									) : (
										<span className={cn(
											"text-[12px] font-semibold tabular-nums",
											(creditsBalance ?? 0) <= 0 ? "text-destructive" : "text-foreground",
										)}>
											{(creditsBalance ?? 0).toFixed(2)}
										</span>
									)}
								</div>
							</motion.div>
						)}

						{/* 5 小时额度（仅后台开启 Vetta Go 时展示） */}
						{fiveHourWindow && (
							<motion.div key="quota" variants={itemVariants}>
								<div className="mx-1 my-1 border-t border-border" />
								<div className="mx-2 my-1.5 rounded-md bg-accent/50 px-2 py-1.5">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-1.5">
											<span className="icon-[solar--hourglass-linear] h-3.5 w-3.5 text-muted-foreground" />
											<span className="text-[11px] text-muted-foreground">{t("sidebar.fiveHourQuota")}</span>
										</div>
										<span className={cn(
											"text-[11px] font-semibold tabular-nums",
											fiveHourRemainingPercent <= 0 ? "text-destructive" : "text-foreground",
										)}>
											{fiveHourRemainingPercent}%
										</span>
									</div>
									<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
										<div
											className="h-full rounded-full bg-primary/70 transition-all"
											style={{ width: `${fiveHourRemainingPercent}%` }}
										/>
									</div>
									<div className="mt-1 text-[10px] text-muted-foreground">
										{formatResetCountdown(fiveHourWindow.reset_at, Date.now())}
									</div>
								</div>
							</motion.div>
						)}

						{/* Separator */}
						<motion.div variants={dividerVariants}>
							<div className="mx-1 my-1 border-t border-border" />
						</motion.div>

						{/* Login / User */}
						<motion.div variants={itemVariants}>
							{user ? (
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										logout();
									}}
									className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
								>
									<span className="icon-[solar--logout-2-linear] h-3.5 w-3.5" />
									{t("sidebar.logout")}
								</button>
							) : (
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										setLoginOpen(true);
									}}
									className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
								>
									<span className="icon-[solar--login-2-linear] h-3.5 w-3.5" />
									{t("sidebar.login")}
								</button>
							)}
						</motion.div>

						{/* Separator */}
						<motion.div variants={dividerVariants}>
							<div className="mx-1 my-1 border-t border-border" />
						</motion.div>

						{/* Downloads */}
						<motion.div variants={itemVariants}>
							<button
								type="button"
								onClick={() => {
									setOpen(false);
									void navigate({ to: "/downloads" });
								}}
								className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
							>
								<span className="icon-[solar--download-linear] h-3.5 w-3.5" />
								{t("sidebar.downloadManagement")}
								{activeDownloads > 0 && (
									<span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
										{activeDownloads}
									</span>
								)}
							</button>
						</motion.div>

						{/* Settings */}
						<motion.div variants={itemVariants}>
							<button
								type="button"
								onClick={() => {
									setOpen(false);
									void navigate({ to: "/settings/$tab", params: { tab: "account" } });
								}}
								className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
							>
								<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
								{t("sidebar.settings")}
							</button>
						</motion.div>
					</motion.div>
						</motion.div>
					</PopoverContent>
				)}
			</AnimatePresence>
		</Popover>
	);
}
