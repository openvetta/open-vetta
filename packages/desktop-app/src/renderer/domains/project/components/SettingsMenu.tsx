import { useState, useRef, useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "@shared/hooks/useTheme";
import { useAuth } from "@domains/auth/hooks/useAuth";
import { downloadsActiveCountAtom, themeModeAtom, loginDialogOpenAtom, type ThemeMode } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
	{ value: "light", label: "浅色", icon: "icon-[mdi--white-balance-sunny]" },
	{ value: "dark", label: "深色", icon: "icon-[mdi--moon-waning-crescent]" },
	{ value: "auto", label: "跟随系统", icon: "icon-[mdi--laptop]" },
];

export function SettingsMenu(): JSX.Element {
	const [open, setOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const mode = useAtomValue(themeModeAtom);
	const activeDownloads = useAtomValue(downloadsActiveCountAtom);
	const { setMode } = useTheme();
	const navigate = useNavigate();
	const setLoginOpen = useSetAtom(loginDialogOpenAtom);
	const { user, logout } = useAuth();

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open]);

	return (
		<div className="relative">
			<AnimatePresence>
				{open && (
					<motion.div
						ref={menuRef}
						initial={{ opacity: 0, y: 4, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 4, scale: 0.98 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className="absolute bottom-full left-1 mb-1.5 w-[180px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
					>
						{/* Theme section */}
						<div className="px-2 pb-1 pt-1.5">
							<span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
								主题
							</span>
						</div>
						{THEME_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => {
									void setMode(opt.value);
								}}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
									mode === opt.value
										? "bg-primary text-primary-foreground"
										: "text-foreground hover:bg-accent",
								)}
							>
								<span className={cn(opt.icon, "h-3.5 w-3.5")} />
								{opt.label}
								{mode === opt.value && (
									<span className="icon-[mdi--check] ml-auto h-3.5 w-3.5" />
								)}
							</button>
						))}

						{/* Separator */}
						<div className="mx-1 my-1 border-t border-border" />

						{/* Login / User */}
						{user ? (
							<button
								type="button"
								onClick={() => {
									setOpen(false);
									logout();
								}}
								className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
							>
								<span className="icon-[mdi--logout] h-3.5 w-3.5" />
								退出登录
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
								<span className="icon-[mdi--login] h-3.5 w-3.5" />
								登录
							</button>
						)}

						{/* Separator */}
						<div className="mx-1 my-1 border-t border-border" />

						{/* Downloads */}
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								void navigate({ to: "/downloads" });
							}}
							className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--download-outline] h-3.5 w-3.5" />
							下载管理
							{activeDownloads > 0 && (
								<span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
									{activeDownloads}
								</span>
							)}
						</button>

						{/* Settings */}
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								void navigate({ to: "/settings/$tab", params: { tab: "general" } });
							}}
							className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--cog-outline] h-3.5 w-3.5" />
							设置
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			<button
				ref={buttonRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-[12px] font-medium transition-colors",
					open
						? "bg-accent text-foreground"
						: "text-foreground hover:bg-accent/50",
				)}
			>
				{user ? (
					<>
						{user.avatar ? (
							<img src={user.avatar} className="h-4 w-4 rounded-full" />
						) : (
							<span className="icon-[mdi--account-circle] h-4 w-4" />
						)}
						<span className="truncate">{user.username}</span>
					</>
				) : (
					<>
						<span className="icon-[mdi--cog-outline] h-3.5 w-3.5" />
						设置
					</>
				)}
			</button>
		</div>
	);
}
