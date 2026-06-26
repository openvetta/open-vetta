interface IconProps {
	className?: string;
}

export function GitIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<circle cx="18" cy="18" r="3" />
			<circle cx="6" cy="6" r="3" />
			<path d="M6 21V9a9 9 0 0 0 9 9" />
		</svg>
	);
}

export function RefreshIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M21 12a9 9 0 1 1-2.64-6.36" />
			<path d="M21 3v6h-6" />
		</svg>
	);
}

export function FileIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M14 3v4a1 1 0 0 0 1 1h4" />
			<path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
		</svg>
	);
}

export function CloseIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

export function SidebarIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M9 4v16" />
		</svg>
	);
}
