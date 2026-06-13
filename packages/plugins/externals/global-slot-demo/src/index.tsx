import { useMemo, useState } from "react";
import { definePlugin } from "@vetta/plugin-sdk";
import "./style.css";

function DemoGlobalSlot() {
	const [open, setOpen] = useState(true);
	const [count, setCount] = useState(0);
	const timestamp = useMemo(() => new Date().toLocaleTimeString(), []);

	if (!open) {
		return (
			<button
				type="button"
				className="fixed right-[16px] bottom-[16px] z-[100] cursor-pointer rounded-[8px] border border-transparent bg-[var(--primary)] px-[11px] py-[7px] font-[var(--font-sans)] text-[13px] font-semibold text-[var(--primary-foreground)] shadow-[var(--shadow-md)] hover:opacity-90"
				onClick={() => setOpen(true)}
			>
				Plugin Demo
			</button>
		);
	}

	return (
		<section
			className="fixed right-[16px] bottom-[16px] z-[100] w-[min(320px,calc(100vw-32px))] rounded-[12px] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--popover)_96%,transparent)] p-[14px] font-[var(--font-sans)] text-[var(--popover-foreground)] shadow-[var(--shadow-lg)]"
			aria-label="Global slot demo plugin"
		>
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<p className="mb-[4px] text-[11px] font-bold tracking-[0.08em] text-[var(--primary)] uppercase">
						Plugin
					</p>
					<h2 className="text-[15px] font-bold text-[var(--foreground)]">Global Slot Demo</h2>
				</div>
				<button
					type="button"
					className="h-[26px] w-[26px] cursor-pointer rounded-[8px] border border-transparent bg-[var(--accent)] text-[13px] leading-none font-semibold text-[var(--foreground)] hover:opacity-90"
					onClick={() => setOpen(false)}
					aria-label="Hide plugin demo"
				>
					x
				</button>
			</div>
			<p className="mt-[10px] mb-[12px] text-[13px] leading-[1.5] text-[var(--muted-foreground)]">
				Rendered by an external plugin at {timestamp}. It uses the host React singleton and Vetta theme tokens.
			</p>
			<div className="flex items-center justify-between gap-[10px]">
				<span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_75%,transparent)] px-[8px] py-[3px] text-[12px] text-[var(--muted-foreground)]">
					Clicks: {count}
				</span>
				<button
					type="button"
					className="cursor-pointer rounded-[8px] border border-transparent bg-[var(--primary)] px-[10px] py-[6px] text-[13px] font-semibold text-[var(--primary-foreground)] hover:opacity-90"
					onClick={() => setCount((value) => value + 1)}
				>
					Increment
				</button>
			</div>
		</section>
	);
}

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerGlobalSlot({
			id: "demo-panel",
			component: DemoGlobalSlot,
		});
	},
});
