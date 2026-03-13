export function WelcomeScreen(): JSX.Element {
	return (
		<div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-[var(--content-bg)]">
			{/* Logo mark */}
			<img
				src="./icon.png"
				alt="Vetta"
				className="h-14 w-14 rounded-2xl"
				style={{ boxShadow: "0 4px 24px var(--accent-glow), 0 0 0 1px var(--accent-dim)" }}
			/>

			{/* Text */}
			<div className="text-center">
				<h1 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
					Vetta Agent
				</h1>
				<p className="mt-1 text-[13px] text-[var(--text-3)]">
					Select a session from the sidebar, or start a new one
				</p>
			</div>

			{/* Hint pill */}
			<div className="mt-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1 text-[11px] text-[var(--text-2)]">
				Press{" "}
				<kbd className="mx-0.5 rounded-[3px] bg-[var(--surface-overlay)] px-1 py-px font-mono text-[10px] text-[var(--text-1)]">
					⌘ N
				</kbd>{" "}
				to open a project
			</div>
		</div>
	);
}
