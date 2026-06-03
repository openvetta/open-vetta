import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { authTokenAtom, authUserAtom } from "@shared/store/auth-atoms";
import { updateProfile } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";
import { SubscriptionCards } from "./SubscriptionCards";

export function AccountSettings(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);

	// Nickname editing
	const [nickname, setNickname] = useState(user?.nickname ?? "");
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);

	useEffect(() => {
		setNickname(user?.nickname ?? "");
	}, [user?.nickname]);

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

			{/* 会员套餐:Vetta Go / Vetta Zen（积分余额展示于 Vetta Zen 卡内） */}
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
		</div>
	);
}
