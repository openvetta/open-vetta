import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
	activeSessionAtom,
	browserUrlBySessionAtom,
	getBrowserUrlForSession,
	setBrowserUrlForSessionAtom,
} from "@shared/store/atoms";

/** 所有会话的内置浏览器共享一份持久 cookie/会话，登录一次到处复用。 */
const BROWSER_PARTITION = "persist:vetta-browser";

/** Electron <webview> 标签运行时方法的最小接口（仅声明本面板用到的）。 */
interface WebviewElement extends HTMLElement {
	canGoBack(): boolean;
	canGoForward(): boolean;
	goBack(): void;
	goForward(): void;
	reload(): void;
	stop(): void;
	loadURL(url: string): Promise<void>;
	getURL(): string;
}

/** 把地址栏输入规整为可加载的 URL：已带协议直接用，否则补 https://，空则返回 null。 */
function normalizeUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function ToolbarButton({
	icon,
	title,
	disabled,
	onClick,
}: {
	icon: string;
	title: string;
	disabled?: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
			className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
		>
			<span className={`${icon} h-4 w-4`} />
		</button>
	);
}

/**
 * 会话级内置浏览器：单 webview 的临时预览窗。
 * - 按 sessionPath 隔离：切会话时 webview 重挂载并加载该会话存的 URL。
 * - 跨活动 tab 保活由 ActivityPanel 负责（常驻挂载 + CSS 隐藏，不条件卸载）。
 */
export function BrowserPanel(): JSX.Element {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const sessionPath = activeSession?.sessionPath ?? null;
	const urlMap = useAtomValue(browserUrlBySessionAtom);
	const targetUrl = getBrowserUrlForSession(urlMap, sessionPath);
	const setSessionUrl = useSetAtom(setBrowserUrlForSessionAtom);

	const webviewRef = useRef<WebviewElement | null>(null);
	const readyRef = useRef(false);
	const pendingRef = useRef<string | null>(null);
	const [address, setAddress] = useState(targetUrl ?? "");
	const [currentUrl, setCurrentUrl] = useState(targetUrl ?? "");
	const [canBack, setCanBack] = useState(false);
	const [canForward, setCanForward] = useState(false);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);

	// 绑定 webview 事件：导航/加载状态同步到工具栏与会话记忆。
	useEffect(() => {
		const el = webviewRef.current;
		if (!el || !sessionPath) return;
		const syncNav = (): void => {
			setCanBack(el.canGoBack());
			setCanForward(el.canGoForward());
		};
		const onStart = (): void => {
			setLoading(true);
			setFailed(false);
		};
		const onStop = (): void => {
			setLoading(false);
			syncNav();
		};
		const onReady = (): void => {
			readyRef.current = true;
			const pending = pendingRef.current;
			pendingRef.current = null;
			if (pending && el.getURL() !== pending) void el.loadURL(pending).catch(() => setFailed(true));
		};
		const onNavigate = (event: Event): void => {
			const { url } = event as unknown as { url: string };
			// about:blank 是为挂载 guest 而设的占位初始页，不当作真实页面回写。
			if (url === "about:blank") return;
			setCurrentUrl(url);
			setAddress(url);
			syncNav();
			setSessionUrl({ sessionPath, url });
		};
		const onInPage = (event: Event): void => {
			const ev = event as unknown as { url: string; isMainFrame: boolean };
			if (!ev.isMainFrame || ev.url === "about:blank") return;
			setCurrentUrl(ev.url);
			setAddress(ev.url);
			syncNav();
			setSessionUrl({ sessionPath, url: ev.url });
		};
		const onFail = (event: Event): void => {
			// errorCode -3 (ABORTED) 多因重定向/手动停止，非真实失败，忽略。
			const ev = event as unknown as { errorCode: number; isMainFrame: boolean };
			if (ev.isMainFrame && ev.errorCode !== -3) {
				setLoading(false);
				setFailed(true);
			}
		};
		el.addEventListener("did-start-loading", onStart);
		el.addEventListener("did-stop-loading", onStop);
		el.addEventListener("dom-ready", onReady);
		el.addEventListener("did-navigate", onNavigate);
		el.addEventListener("did-navigate-in-page", onInPage);
		el.addEventListener("did-fail-load", onFail);
		return () => {
			el.removeEventListener("did-start-loading", onStart);
			el.removeEventListener("did-stop-loading", onStop);
			el.removeEventListener("dom-ready", onReady);
			el.removeEventListener("did-navigate", onNavigate);
			el.removeEventListener("did-navigate-in-page", onInPage);
			el.removeEventListener("did-fail-load", onFail);
		};
	}, [sessionPath, setSessionUrl]);

	// 外部 targetUrl 变化（点会话链接 / 地址栏导航）→ 与当前页不同则加载；未就绪先挂起。
	useEffect(() => {
		const el = webviewRef.current;
		if (!el || !targetUrl) return;
		if (!readyRef.current) {
			pendingRef.current = targetUrl;
			return;
		}
		if (el.getURL() !== targetUrl) void el.loadURL(targetUrl).catch(() => setFailed(true));
	}, [targetUrl]);

	const navigate = useCallback(
		(raw: string) => {
			const url = normalizeUrl(raw);
			if (!url || !sessionPath) return;
			setSessionUrl({ sessionPath, url });
		},
		[sessionPath, setSessionUrl],
	);

	const onAddressSubmit = useCallback(
		(event: React.FormEvent) => {
			event.preventDefault();
			navigate(address);
		},
		[address, navigate],
	);

	const retry = useCallback(() => {
		const el = webviewRef.current;
		if (!el) return;
		setFailed(false);
		el.reload();
	}, []);

	const openExternal = useCallback(() => {
		if (currentUrl) void window.vetta.auth.openExternal(currentUrl);
	}, [currentUrl]);

	if (!sessionPath) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[12px] text-muted-foreground/60">
				{t("browser.noSession")}
			</div>
		);
	}

	const hasPage = currentUrl !== "" || targetUrl != null;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-1.5 py-1.5">
				<ToolbarButton
					icon="icon-[mdi--arrow-left]"
					title={t("browser.back")}
					disabled={!canBack}
					onClick={() => webviewRef.current?.goBack()}
				/>
				<ToolbarButton
					icon="icon-[mdi--arrow-right]"
					title={t("browser.forward")}
					disabled={!canForward}
					onClick={() => webviewRef.current?.goForward()}
				/>
				{loading ? (
					<ToolbarButton
						icon="icon-[mdi--close]"
						title={t("browser.stop")}
						onClick={() => webviewRef.current?.stop()}
					/>
				) : (
					<ToolbarButton
						icon="icon-[mdi--refresh]"
						title={t("browser.reload")}
						onClick={() => webviewRef.current?.reload()}
					/>
				)}
				<form onSubmit={onAddressSubmit} className="min-w-0 flex-1">
					<input
						type="text"
						value={address}
						spellCheck={false}
						placeholder={t("browser.addressPlaceholder")}
						onChange={(e) => setAddress(e.target.value)}
						className="h-7 w-full rounded-md border border-transparent bg-transparent px-2.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background"
					/>
				</form>
				<ToolbarButton
					icon="icon-[mdi--open-in-new]"
					title={t("browser.openExternal")}
					disabled={!currentUrl}
					onClick={openExternal}
				/>
			</div>

			<div className="relative flex min-h-0 flex-1">
				{/* src 用静态 about:blank 让 guest 立即挂载（dom-ready 才会触发），
				    真实地址由 effect 通过 loadURL 加载；src 不绑 targetUrl 以免页内跳转触发重载。 */}
				<webview
					key={sessionPath}
					ref={webviewRef as React.Ref<HTMLElement>}
					src="about:blank"
					partition={BROWSER_PARTITION}
					allowpopups={true}
					className="h-full w-full"
				/>
				{!hasPage && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center">
						<span className="icon-[mdi--web] h-8 w-8 text-muted-foreground/30" />
						<span className="text-[12px] text-muted-foreground/60">{t("browser.empty")}</span>
					</div>
				)}
				{loading && (
					<div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
						<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						{t("browser.loading")}
					</div>
				)}
				{failed && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
						<span className="icon-[mdi--alert-circle-outline] h-8 w-8 text-muted-foreground/40" />
						<span className="text-[12px] text-muted-foreground/70">{t("browser.failed")}</span>
						<button
							type="button"
							onClick={retry}
							className="rounded-md border border-border bg-background px-3 py-1 text-[12px] text-foreground transition-colors hover:bg-muted-foreground/10"
						>
							{t("browser.retry")}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
