import { useState, useEffect } from "react";
import { shortcutParts } from "../lib/platform";
import { SHORTCUT_ACTIONS, getEffectiveShortcut, loadShortcuts } from "../lib/shortcuts";

export function WelcomeScreen(): JSX.Element {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setMounted(true), 50);
		return () => clearTimeout(timer);
	}, []);

	const customShortcuts = loadShortcuts();
	const hints = SHORTCUT_ACTIONS.filter((a) =>
		["new-session", "open-project"].includes(a.id),
	).map((a) => ({
		label: a.label,
		keys: shortcutParts(getEffectiveShortcut(a.id, customShortcuts)),
	}));

	return (
		<div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-background">
			{/* Drag region */}
			<div className="drag-region absolute inset-x-0 top-0 z-10 h-12" />

			{/* Ambient background glow */}
			<div className="pointer-events-none absolute inset-0">
				<div
					className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.03]"
					style={{
						background:
							"radial-gradient(circle, var(--primary) 0%, transparent 70%)",
					}}
				/>
				<div
					className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-[60%] rounded-full opacity-[0.04]"
					style={{
						background:
							"radial-gradient(circle, var(--primary) 0%, transparent 60%)",
					}}
				/>
			</div>

			{/* Main content */}
			<div
				className="relative flex flex-col items-center"
				style={{
					opacity: mounted ? 1 : 0,
					transform: mounted ? "translateY(0)" : "translateY(8px)",
					transition:
						"opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
				}}
			>
				{/* Logo with refined glow */}
				<div className="relative mb-6">
					<div
						className="absolute -inset-3 rounded-[22px] opacity-40"
						style={{
							background:
								"radial-gradient(circle, color-mix(in srgb, var(--ring) 50%, transparent) 0%, transparent 70%)",
							filter: "blur(12px)",
						}}
					/>
					<img
						src="./icon.png"
						alt="Vetta"
						className="relative h-[68px] w-[68px] rounded-[18px]"
						style={{
							boxShadow:
								"0 0 0 0.5px color-mix(in srgb, var(--primary) 10%, transparent), 0 8px 40px -8px rgba(0,0,0,0.3), 0 2px 12px color-mix(in srgb, var(--ring) 50%, transparent)",
						}}
					/>
				</div>

				{/* Typography */}
				<h1
					className="text-[22px] font-semibold tracking-[-0.03em] text-foreground"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(6px)",
						transition:
							"opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.08s",
					}}
				>
					欢迎使用 Vetta
				</h1>

				<p
					className="mt-2 text-[13px] leading-relaxed text-muted-foreground/50"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(6px)",
						transition:
							"opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s",
					}}
				>
					你的智能编程伙伴
				</p>

				{/* Divider */}
				<div
					className="my-6 h-px w-12"
					style={{
						background:
							"linear-gradient(90deg, transparent, var(--input), transparent)",
						opacity: mounted ? 1 : 0,
						transition: "opacity 0.8s ease 0.25s",
					}}
				/>

				{/* Action hints */}
				<div
					className="flex flex-col items-center gap-2.5"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(6px)",
						transition:
							"opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
					}}
				>
					{hints.map((hint) => (
						<HintRow key={hint.label} keys={hint.keys} label={hint.label} />
					))}
				</div>
			</div>
		</div>
	);
}

function HintRow({ keys, label }: { keys: string[]; label: string }) {
	return (
		<div className="flex items-center gap-3 text-[12px] text-muted-foreground/50">
			<div className="flex items-center gap-0.5">
				{keys.map((k, i) => (
					<kbd
						key={i}
						className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-input bg-muted px-1.5 font-mono text-[11px] text-muted-foreground"
						style={{
							boxShadow:
								"0 1px 0 color-mix(in srgb, var(--primary) 10%, transparent), inset 0 0.5px 0 rgba(255,255,255,0.04)",
						}}
					>
						{k}
					</kbd>
				))}
			</div>
			<span className="text-muted-foreground">{label}</span>
		</div>
	);
}
