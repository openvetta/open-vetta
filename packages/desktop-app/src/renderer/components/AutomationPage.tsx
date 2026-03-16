export function AutomationPage(): JSX.Element {
	return (
		<div className="relative flex h-full w-full flex-1 items-center justify-center">
			{/* Drag region */}
			<div className="drag-region absolute inset-x-0 top-0 h-12" />
			<h1 className="text-2xl font-semibold text-[var(--text-1)]">自动化</h1>
		</div>
	);
}
