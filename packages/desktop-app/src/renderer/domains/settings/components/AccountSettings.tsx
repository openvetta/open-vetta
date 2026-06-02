import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { authTokenAtom, authUserAtom, creditsBalanceAtom } from "@shared/store/auth-atoms";
import {
	fetchCreditsBalance,
	fetchCreditTransactions,
	updateProfile,
	type CreditTransactionVO,
} from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

const TX_TYPE_LABELS: Record<string, string> = {
	deduct: "消费",
	topup: "充值",
	admin_adjust: "管理员调整",
	initial: "初始赠送",
};

function formatDate(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AccountSettings(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);
	const [creditsBalance, setCreditsBalance] = useAtom(creditsBalanceAtom);

	// Nickname editing
	const [nickname, setNickname] = useState(user?.nickname ?? "");
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);

	// Credit transactions
	const [transactions, setTransactions] = useState<CreditTransactionVO[]>([]);
	const [txTotal, setTxTotal] = useState(0);
	const [txPage, setTxPage] = useState(1);
	const [txLoading, setTxLoading] = useState(false);
	const txPageSize = 10;

	useEffect(() => {
		setNickname(user?.nickname ?? "");
	}, [user?.nickname]);

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

	const handleSaveNickname = useCallback(async () => {
		if (!token || !nickname.trim()) return;
		setSaving(true);
		setSaveMsg(null);
		try {
			const updated = await updateProfile(token, { nickname: nickname.trim() });
			setUser((prev) => (prev ? { ...prev, nickname: updated.nickname } : prev));
			setSaveMsg("已保存");
			setTimeout(() => setSaveMsg(null), 2000);
		} catch (e) {
			setSaveMsg(e instanceof Error ? e.message : "保存失败");
		} finally {
			setSaving(false);
		}
	}, [token, nickname, setUser]);

	const totalPages = Math.ceil(txTotal / txPageSize);

	if (!user) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">账户</h1>
				<p className="text-[13px] text-muted-foreground">请先登录</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">账户</h1>

			{/* Profile */}
			<SettingSection section={SETTINGS_SECTION["account-profile"]}>
				<SettingRow title="用户名" description="用户名不可修改" border>
					<span className="text-[13px] text-muted-foreground">{user.username}</span>
				</SettingRow>
				<SettingRow title="昵称" border={false}>
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							placeholder="输入昵称"
							maxLength={50}
							className="h-8 w-[180px] rounded-lg border border-input bg-background px-3 text-[12px] text-foreground outline-none transition-colors focus:border-primary"
						/>
						<button
							type="button"
							disabled={saving || nickname.trim() === (user.nickname ?? "")}
							onClick={() => void handleSaveNickname()}
							className={cn(
								"h-8 rounded-lg px-3 text-[12px] font-medium transition-colors",
								saving || nickname.trim() === (user.nickname ?? "")
									? "bg-muted text-muted-foreground"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
						>
							{saving ? "保存中..." : "保存"}
						</button>
						{saveMsg && (
							<span className="text-[11px] text-muted-foreground">{saveMsg}</span>
						)}
					</div>
				</SettingRow>
			</SettingSection>

			{/* Credits */}
			<SettingSection section={SETTINGS_SECTION["account-credits"]}>
				<div className="px-5 py-4">
					<div className="flex items-center gap-3">
						<span className="icon-[mdi--wallet-outline] h-5 w-5 text-muted-foreground" />
						<div>
							<div className="text-[12px] text-muted-foreground">当前余额</div>
							<div className={cn(
								"text-[20px] font-bold tabular-nums",
								creditsBalance !== null && creditsBalance <= 0
									? "text-red-500"
									: "text-foreground",
							)}>
								{creditsBalance !== null ? creditsBalance.toFixed(2) : "--"}
							</div>
						</div>
					</div>
				</div>
			</SettingSection>

			{/* Transactions */}
			<SettingSection section={SETTINGS_SECTION["account-transactions"]}>
				{txLoading && transactions.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
						加载中...
					</div>
				) : transactions.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
						暂无记录
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
											余额 {tx.balance.toFixed(2)}
										</div>
									</div>
								</div>
							))}
						</div>
						{/* Pagination */}
						{totalPages > 1 && (
							<div className="flex items-center justify-center gap-2 border-t border-border px-5 py-3">
								<button
									type="button"
									disabled={txPage <= 1}
									onClick={() => loadTransactions(txPage - 1)}
									className="rounded px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
								>
									上一页
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
									下一页
								</button>
							</div>
						)}
					</>
				)}
			</SettingSection>
		</div>
	);
}
