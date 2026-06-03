import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { authTokenAtom, authUserAtom, subscriptionStatusAtom } from "@shared/store/auth-atoms";
import { updateProfile } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@shared/components/ui/dialog";
import { SubscriptionCards } from "./SubscriptionCards";

export function AccountSettings(): JSX.Element {
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

	// 打开弹窗时用最新昵称回填、清错。
	useEffect(() => {
		if (dialogOpen) {
			setNickname(user?.nickname ?? "");
			setError(null);
		}
	}, [dialogOpen, user?.nickname]);

	const handleSaveNickname = useCallback(async () => {
		if (!token || !nickname.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const updated = await updateProfile(token, { nickname: nickname.trim() });
			setUser((prev) => (prev ? { ...prev, nickname: updated.nickname } : prev));
			setDialogOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : "保存失败");
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
	const showBadge = subscription.go_enabled && !!subscription.badge_text;

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
							<img src={user.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
						) : (
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
								<span className="icon-[mdi--account] h-10 w-10 text-muted-foreground" />
							</div>
						)}
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
							title="编辑昵称"
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

			{/* 会员套餐:Vetta Go / Vetta Zen（积分余额展示于 Vetta Zen 卡内） */}
			<SubscriptionCards />

			{/* 编辑昵称弹窗（与自动化 dialog 风格统一） */}
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
						<DialogTitle className="text-[15px] font-semibold text-foreground">编辑昵称</DialogTitle>
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
							placeholder="输入昵称"
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
							取消
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
							{saving ? "保存中..." : "保存"}
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
