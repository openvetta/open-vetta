import { Button, ButtonGroup, ButtonGroupItem } from "@vetta-org/ui";
import type { FormEvent, JSX, Ref } from "react";

export interface BrowserPanelLabels {
	noSession: string;
	back: string;
	forward: string;
	stop: string;
	reload: string;
	addressPlaceholder: string;
	openExternal: string;
	empty: string;
	loading: string;
	failed: string;
	retry: string;
}

export interface BrowserPanelViewProps {
	/** Null when the host has no bound workspace — show empty state. */
	workspaceId: string | null;
	labels: BrowserPanelLabels;
	address: string;
	canBack: boolean;
	canForward: boolean;
	loading: boolean;
	failed: boolean;
	hasPage: boolean;
	currentUrl: string;
	partition: string;
	webviewRef: Ref<HTMLElement>;
	onAddressChange: (value: string) => void;
	onAddressSubmit: (event: FormEvent) => void;
	onBack: () => void;
	onForward: () => void;
	onStop: () => void;
	onReload: () => void;
	onOpenExternal: () => void;
	onRetry: () => void;
}

function toolbarIcon(icon: string): JSX.Element {
	return <span className={`${icon} text-[14px]`} />;
}

/**
 * Session-scoped built-in browser shell. Host owns webview event wiring via ref.
 */
export function BrowserPanelView({
	workspaceId,
	labels,
	address,
	canBack,
	canForward,
	loading,
	failed,
	hasPage,
	currentUrl,
	partition,
	webviewRef,
	onAddressChange,
	onAddressSubmit,
	onBack,
	onForward,
	onStop,
	onReload,
	onOpenExternal,
	onRetry,
}: BrowserPanelViewProps): JSX.Element {
	if (!workspaceId) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[12px] text-muted-foreground/60">
				{labels.noSession}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-10 border-b border-border/60 px-3 py-1.5">
				<ButtonGroup blur={false} className="shrink-0">
					<ButtonGroupItem
						icon={toolbarIcon("icon-[mdi--arrow-left]")}
						title={labels.back}
						aria-label={labels.back}
						disabled={!canBack}
						onClick={onBack}
					/>
					<ButtonGroupItem
						icon={toolbarIcon("icon-[mdi--arrow-right]")}
						title={labels.forward}
						aria-label={labels.forward}
						disabled={!canForward}
						onClick={onForward}
					/>
					{loading ? (
						<ButtonGroupItem
							icon={toolbarIcon("icon-[mdi--close]")}
							title={labels.stop}
							aria-label={labels.stop}
							onClick={onStop}
						/>
					) : (
						<ButtonGroupItem
							icon={toolbarIcon("icon-[mdi--refresh]")}
							title={labels.reload}
							aria-label={labels.reload}
							onClick={onReload}
						/>
					)}
				</ButtonGroup>
				<form onSubmit={onAddressSubmit} className="min-w-0 flex-1">
					{/* 地址栏按按钮组的胶囊皮自绘：同款填充色与全圆角，focus 不描边，与左右两组留出间距。 */}
					<input
						type="text"
						value={address}
						spellCheck={false}
						placeholder={labels.addressPlaceholder}
						onChange={(e) => onAddressChange(e.target.value)}
						className="h-8 w-full rounded-full bg-foreground/[0.06] px-3.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:bg-foreground/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.1]"
					/>
				</form>
				<ButtonGroup blur={false} className="shrink-0">
					<ButtonGroupItem
						icon={toolbarIcon("icon-[mdi--open-in-new]")}
						title={labels.openExternal}
						aria-label={labels.openExternal}
						disabled={!currentUrl}
						onClick={onOpenExternal}
					/>
				</ButtonGroup>
			</div>

			<div className="relative flex min-h-0 flex-1">
				{/* src 用静态 about:blank 让 guest 立即挂载（dom-ready 才会触发），
				    真实地址由 effect 通过 loadURL 加载；src 不绑 targetUrl 以免页内跳转触发重载。 */}
				<webview
					key={workspaceId}
					ref={webviewRef}
					src="about:blank"
					partition={partition}
					allowpopups={true}
					className="h-full w-full"
				/>
				{!hasPage && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center">
						<span className="icon-[mdi--web] h-8 w-8 text-muted-foreground/30" />
						<span className="text-[12px] text-muted-foreground/60">{labels.empty}</span>
					</div>
				)}
				{loading && (
					<div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
						<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						{labels.loading}
					</div>
				)}
				{failed && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
						<span className="icon-[mdi--alert-circle-outline] h-8 w-8 text-muted-foreground/40" />
						<span className="text-[12px] text-muted-foreground/70">{labels.failed}</span>
						<Button variant="outline" size="sm" onClick={onRetry}>
							{labels.retry}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
