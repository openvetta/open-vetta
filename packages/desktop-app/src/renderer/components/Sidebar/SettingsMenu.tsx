import { useState, useRef, useEffect } from "react";
import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../../hooks/useTheme";
import { themeModeAtom, type ThemeMode } from "../../store/atoms";
import { cn } from "../../lib/utils";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
	{ value: "light", label: "Light", icon: "icon-[mdi--white-balance-sunny]" },
	{ value: "dark", label: "Dark", icon: "icon-[mdi--moon-waning-crescent]" },
	{ value: "auto", label: "Auto", icon: "icon-[mdi--laptop]" },
];

export function SettingsMenu(): JSX.Element {
	const [open, setOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const mode = useAtomValue(themeModeAtom);
	const { setMode } = useTheme();

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
						className="absolute bottom-full left-1 mb-1.5 w-[180px] overflow-hidden rounded-lg border border-[var(--popup-border)] bg-[var(--popup-bg)] p-1"
						style={{ boxShadow: "var(--popup-shadow)" }}
					>
						{/* Theme section */}
						<div className="px-2 pb-1 pt-1.5">
							<span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
								Theme
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
										? "bg-[var(--accent)] text-[var(--accent-fg)]"
										: "text-[var(--text-1)] hover:bg-[var(--popup-hover)]",
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
						<div className="mx-1 my-1 border-t border-[var(--popup-separator)]" />

						{/* Settings */}
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								// TODO: navigate to settings page
							}}
							className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--popup-hover)]"
						>
							<span className="icon-[mdi--cog-outline] h-3.5 w-3.5" />
							Settings
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
						? "bg-[var(--hover-strong)] text-[var(--text-1)]"
						: "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]",
				)}
			>
				<span className="icon-[mdi--cog-outline] h-3.5 w-3.5" />
				Settings
			</button>
		</div>
	);
}
