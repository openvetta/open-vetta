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

export function ListViewIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M8 6h13" />
			<path d="M8 12h13" />
			<path d="M8 18h13" />
			<path d="M3 6h.01" />
			<path d="M3 12h.01" />
			<path d="M3 18h.01" />
		</svg>
	);
}

export function TreeViewIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<path d="M4 4h7" />
			<path d="M9 10h7" />
			<path d="M9 16h7" />
			<path d="M4 4v12a2 2 0 0 0 2 2h1" />
			<path d="M6 10h1" />
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

export function GraphIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<circle cx="5" cy="6" r="2" />
			<circle cx="5" cy="18" r="2" />
			<circle cx="15" cy="12" r="2" />
			<path d="M5 8v8" />
			<path d="M5 12h4a4 4 0 0 0 4-4V8" />
		</svg>
	);
}

export function BranchIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<circle cx="6" cy="6" r="2.5" />
			<circle cx="6" cy="18" r="2.5" />
			<circle cx="18" cy="8" r="2.5" />
			<path d="M6 8.5v7" />
			<path d="M18 10.5a6 6 0 0 1-6 6H6" />
		</svg>
	);
}

export function CopyIcon({ className }: IconProps): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<rect x="9" y="9" width="11" height="11" rx="2" />
			<path d="M5 15V5a2 2 0 0 1 2-2h8" />
		</svg>
	);
}
