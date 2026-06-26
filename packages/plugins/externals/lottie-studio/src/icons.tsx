// Icons are defined as components (created at render), never as module-top-level
// JSX values — an MF remote evaluates the module before React is wired, so a
// top-level `const icon = <svg/>` can throw.

const stroke = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.7,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

export function IconLottie({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M3 16c4-10 8-10 9 0s5 6 9-4" />
			<circle cx="12" cy="12" r="9" strokeWidth={1.3} opacity={0.45} />
		</svg>
	);
}

export function IconPlay({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" className={className}>
			<path d="M8 5v14l11-7z" />
		</svg>
	);
}

export function IconPause({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" className={className}>
			<rect x="6" y="5" width="4" height="14" rx="1" />
			<rect x="14" y="5" width="4" height="14" rx="1" />
		</svg>
	);
}

export function IconRefresh({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M21 12a9 9 0 1 1-2.64-6.36" />
			<path d="M21 3v5h-5" />
		</svg>
	);
}
