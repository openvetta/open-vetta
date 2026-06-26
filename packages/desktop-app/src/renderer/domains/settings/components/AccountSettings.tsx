import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { authTokenAtom, authUserAtom, creditsBalanceAtom, subscriptionStatusAtom } from "@shared/store/auth-atoms";
import {
	fetchCreditsBalance,
	fetchCreditTransactions,
	updateProfile,
	type CreditTransactionVO,
} from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@shared/components/ui/dialog";
import { UserAvatar } from "@shared/components/UserAvatar";
import { SubscriptionCards } from "./SubscriptionCards";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

const TX_TYPE_LABELS: Record<string, string> = {
	deduct: "deduct",
	topup: "topup",
	admin_adjust: "adminAdjust",
	initial: "initial",
};

function formatDate(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AccountSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const token = useAtomValue(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);
	const subscription = useAtomValue(subscriptionStatusAtom);

	// Nickname editing (dialog)
	const [dialogOpen, setDialogOpen] = useState(false);
	const [nickname, setNickname] = useState(user?.nickname ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setNickname(user?.nickname ?? "");
	}, [user?.nickname]);

	// Open dialog: refill with latest nickname, clear errors.
	useEffect(() => {
		if (dialogOpen) {
			setNickname(user?.nickname ?? "");
			setError(null);
		}
	}, [dialogOpen, user?.nickname]);

	// Credit transactions
	// Credits balance is only used to fill the shared atom (for Vetta Zen card display), this page no longer renders a separate credits section.
	const setCreditsBalance = useSetAtom(creditsBalanceAtom);
	const [transactions, setTransactions] = useState<CreditTransactionVO[]>([]);
	const [txTotal, setTxTotal] = useState(0);
	const [txPage, setTxPage] = useState(1);
	const [txLoading, setTxLoading] = useState(false);
	const txPageSize = 10;

	// Fetch balance
	useEffect(() => {
		if (!token) return;
		void fetchCreditsBalance(token)
			.then((r) => setCreditsBalance(r.balance))
			.catch(() => {});
	}, [token, setCreditsBalance]);

	// Fetch transactions
	const loadTransactions = useCallback(
		(page: number) => {
			if (!token) return;
			setTxLoading(true);
			void fetchCreditTransactions(token, page, txPageSize)
				.then((r) => {
					setTransactions(r.list ?? []);
					setTxTotal(r.total);
					setTxPage(r.page);
				})
				.catch(() => {})
				.finally(() => setTxLoading(false));
		},
		[token],
	);

	useEffect(() => {
		loadTransactions(1);
	}, [loadTransactions]);

	const totalPages = Math.ceil(txTotal / txPageSize);

	const handleSaveNickname = useCallback(async () => {
		if (!token || !nickname.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const updated = await updateProfile(token, { nickname: nickname.trim() });
			setUser((prev) => (prev ? { ...prev, nickname: updated.nickname } : prev));
			setDialogOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : t("saveFailed"));
		} finally {
			setSaving(false);
		}
	}, [token, nickname, setUser]);

	if (!user) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-10">
				<p className="text-[13px] text-muted-foreground">{t("pleaseLogin")}</p>
			</div>
		);
	}

	const displayName = user.nickname || user.username;
	const showBadge = subscription.go_enabled && !!subscription.badge_text;

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-6">
			{/* Profile header: avatar + nickname + @username */}
			<motion.div
				className="mb-8 flex items-center gap-5"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 26 }}
			>
				<div className="relative shrink-0">
					<div className="rounded-full bg-gradient-to-br from-primary/40 to-primary/10 p-[2px]">
						<UserAvatar
							avatar={user.avatar}
							nickname={user.nickname}
							username={user.username}
							className="h-20 w-20"
							textClassName="text-3xl"
						/>
					</div>
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-[22px] font-bold leading-tight text-foreground">
							{displayName}
						</h1>
						{showBadge && (
							<span
								className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
								style={{ backgroundColor: subscription.badge_color || "#f59e0b" }}
								title={subscription.tier_name || "Vetta Go"}
							>
								{subscription.badge_text}
							</span>
						)}
						<button
							type="button"
							onClick={() => setDialogOpen(true)}
							title={t("editNickname")}
							className="flex shrink-0 items-center rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
						</button>
					</div>
					<div className="mt-0.5 truncate text-[13px] text-muted-foreground">@{user.username}</div>
					{user.email && (
						<div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
							<span className="icon-[mdi--email-outline] h-3.5 w-3.5" />
							{user.email}
						</div>
					)}
				</div>
			</motion.div>

			{/* Subscription cards: Vetta Go / Vetta Zen (credits balance shown in Vetta Zen card) */}
			<SubscriptionCards />

			{/* Edit nickname dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent
					showCloseButton={false}
					className="flex flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-[420px]"
				>
					{/* 头部：图标 + 标题 */}
					<div className="flex items-center gap-3 px-6 pt-5 pb-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
							<span className="icon-[mdi--account-edit-outline] h-4 w-4 text-primary" />
						</div>
						<DialogTitle className="text-[15px] font-semibold text-foreground">{t("editNickname")}</DialogTitle>
					</div>

					{/* 内容 */}
					<div className="px-6 pb-5">
						<input
							type="text"
							value={nickname}
							autoFocus
							onChange={(e) => setNickname(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") void handleSaveNickname();
							}}
							placeholder={t("enterNickname")}
							maxLength={50}
							className="h-10 w-full rounded-lg border-none bg-muted px-3 text-[14px] text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/40"
						/>
						{error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
					</div>

					{/* 底栏 */}
					<div className="flex items-center justify-end gap-2 border-t border-border/40 bg-background/30 px-5 py-3">
						<button
							type="button"
							onClick={() => setDialogOpen(false)}
							className="h-8 rounded-lg px-3.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent"
						>
							{t("cancel")}
						</button>
						<button
							type="button"
							disabled={saving || !nickname.trim()}
							onClick={() => void handleSaveNickname()}
							className={cn(
								"h-8 rounded-lg px-3.5 text-[12px] font-medium transition-colors",
								saving || !nickname.trim()
									? "bg-muted text-muted-foreground"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
						>
							{saving ? t("saving") : t("save")}
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Transactions：积分是 Vetta Zen 计费体系，后台关闭 Zen 时隐藏积分记录 */}
			{subscription.zen_enabled && (
			<SettingSection t={t as any} section={SETTINGS_SECTION["account-transactions"]}>
				{txLoading && transactions.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
						{t("loading")}
					</div>
				) : transactions.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
						{t("noRecords")}
					</div>
				) : (
					<>
						<div className="divide-y divide-border">
							{transactions.map((tx) => (
								<div key={tx.id} className="flex items-center justify-between px-5 py-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-[13px] font-medium text-foreground">
												{TX_TYPE_LABELS[tx.type] ?? tx.type}
											</span>
											{tx.model_id && (
												<span className="truncate text-[11px] text-muted-foreground">
													{tx.model_id}
												</span>
											)}
										</div>
										<div className="mt-0.5 text-[11px] text-muted-foreground">
											{formatDate(tx.created_at)}
											{tx.remark && ` - ${tx.remark}`}
										</div>
									</div>
									<div className="ml-4 shrink-0 text-right">
										<div className={cn(
											"text-[13px] font-semibold tabular-nums",
											tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-500",
										)}>
											{tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)}
										</div>
										<div className="text-[11px] tabular-nums text-muted-foreground">
											{t("balance", { balance: tx.balance.toFixed(2) })}
										</div>
									</div>
								</div>
							))}
						</div>
						{totalPages > 1 && (
							<div className="flex items-center justify-center gap-2 border-t border-border px-5 py-3">
								<button
									type="button"
									disabled={txPage <= 1}
									onClick={() => loadTransactions(txPage - 1)}
									className="rounded px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
								>
									{t("prevPage")}
								</button>
								<span className="text-[12px] tabular-nums text-muted-foreground">
									{txPage} / {totalPages}
								</span>
								<button
									type="button"
									disabled={txPage >= totalPages}
									onClick={() => loadTransactions(txPage + 1)}
									className="rounded px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
								>
									{t("nextPage")}
								</button>
							</div>
						)}
					</>
				)}
			</SettingSection>
			)}
		</div>
	);
}
