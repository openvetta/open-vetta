import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { authTokenAtom, authUserAtom } from "@shared/store/auth-atoms";
import { updateProfile } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { SubscriptionCards } from "./SubscriptionCards";

export function AccountSettings(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);

	// Nickname editing
	const [editing, setEditing] = useState(false);
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
			setEditing(false);
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
			<div className="mx-auto w-full max-w-[680px] px-8 py-10">
				<p className="text-[13px] text-muted-foreground">请先登录</p>
			</div>
		);
	}

	const displayName = user.nickname || user.username;

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-6">
			{/* Profile 头部：头像 + 昵称 + @用户名 */}
			<motion.div
				className="mb-8 flex items-center gap-5"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 26 }}
			>
				<div className="relative shrink-0">
					<div className="rounded-full bg-gradient-to-br from-primary/40 to-primary/10 p-[2px]">
						{user.avatar ? (
							<img
								src={user.avatar}
								alt=""
								className="h-20 w-20 rounded-full object-cover"
							/>
						) : (
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
								<span className="icon-[mdi--account] h-10 w-10 text-muted-foreground" />
							</div>
						)}
					</div>
				</div>

				<div className="min-w-0 flex-1">
					{editing ? (
						<div className="space-y-2">
							<input
								type="text"
								value={nickname}
								autoFocus
								onChange={(e) => setNickname(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void handleSaveNickname();
									if (e.key === "Escape") {
										setNickname(user.nickname ?? "");
										setEditing(false);
									}
								}}
								placeholder="输入昵称"
								maxLength={50}
								className="h-9 w-full max-w-[260px] rounded-lg border border-input bg-background px-3 text-[15px] text-foreground outline-none transition-colors focus:border-primary"
							/>
							<div className="flex items-center gap-2">
								<button
									type="button"
									disabled={saving || !nickname.trim()}
									onClick={() => void handleSaveNickname()}
									className={cn(
										"h-8 rounded-lg px-3 text-[12px] font-medium transition-colors",
										saving || !nickname.trim()
											? "bg-muted text-muted-foreground"
											: "bg-primary text-primary-foreground hover:bg-primary/90",
									)}
								>
									{saving ? "保存中..." : "保存"}
								</button>
								<button
									type="button"
									onClick={() => {
										setNickname(user.nickname ?? "");
										setEditing(false);
									}}
									className="h-8 rounded-lg px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent"
								>
									取消
								</button>
							</div>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2">
								<h1 className="truncate text-[22px] font-bold leading-tight text-foreground">
									{displayName}
								</h1>
								<button
									type="button"
									onClick={() => setEditing(true)}
									title="编辑昵称"
									className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
								</button>
								{saveMsg && (
									<span className="text-[11px] text-muted-foreground">{saveMsg}</span>
								)}
							</div>
							<div className="mt-0.5 truncate text-[13px] text-muted-foreground">@{user.username}</div>
							{user.email && (
								<div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
									<span className="icon-[mdi--email-outline] h-3.5 w-3.5" />
									{user.email}
								</div>
							)}
						</>
					)}
				</div>
			</motion.div>

			{/* 会员套餐:Vetta Go / Vetta Zen（积分余额展示于 Vetta Zen 卡内） */}
			<SubscriptionCards />
		</div>
	);
}
