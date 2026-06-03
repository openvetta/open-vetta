import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { authTokenAtom, authUserAtom, creditsBalanceAtom, subscriptionStatusAtom } from "@shared/store/auth-atoms";
import { fetchCreditsBalance, updateProfile } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";
import { SubscriptionCards } from "./SubscriptionCards";

export function AccountSettings(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);
	const [creditsBalance, setCreditsBalance] = useAtom(creditsBalanceAtom);
	const subscription = useAtomValue(subscriptionStatusAtom);
	// 积分是 Vetta Zen 计费体系，后台关闭 Zen 时隐藏积分余额
	const showCredits = subscription.zen_enabled;

	// Nickname editing
	const [nickname, setNickname] = useState(user?.nickname ?? "");
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);

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

			{/* 会员套餐:Vetta Go / Vetta Zen */}
			<SubscriptionCards />

			{/* Profile */}
			<SettingSection title="个人信息">
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

			{/* Credits：后台关闭 Vetta Zen 时隐藏 */}
			{showCredits && (
				<SettingSection title="积分">
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
			)}
		</div>
	);
}
