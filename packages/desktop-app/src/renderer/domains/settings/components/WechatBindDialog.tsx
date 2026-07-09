import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import type { ImWechatBindEvent } from "@preload/api";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";

type WechatDialogPhase =
	| "idle"
	| "starting"
	| "waiting"
	| "scanned"
	| "expired_refreshing"
	| "redirected"
	| "confirmed"
	| "failed";

interface WechatDialogState {
	phase: WechatDialogPhase;
	qrUrl?: string;
	qrDataUrl?: string;
	qrAttempt: number;
	error?: string;
}

const initialWechatDialogState: WechatDialogState = {
	phase: "idle",
	qrAttempt: 0,
};

export function WechatBindDialog({
	open,
	onOpenChange,
	bound,
	ilinkBotId,
	ilinkUserId,
	onLogout,
	onConfirmedRefresh,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bound: boolean;
	ilinkBotId?: string;
	ilinkUserId?: string;
	onLogout: () => void;
	onConfirmedRefresh: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const [state, setState] = useState<WechatDialogState>(initialWechatDialogState);
	const subUnsubRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (!open) {
			subUnsubRef.current?.();
			subUnsubRef.current = null;
			setState(initialWechatDialogState);
		}
	}, [open]);

	useEffect(() => {
		const url = state.qrUrl;
		if (!url) return;
		let cancelled = false;
		QRCode.toDataURL(url, {
			errorCorrectionLevel: "M",
			margin: 1,
			width: 240,
			color: { dark: "#000000", light: "#ffffff" },
		})
			.then((dataUrl) => {
				if (!cancelled) {
					setState((prev) => (prev.qrUrl === url ? { ...prev, qrDataUrl: dataUrl } : prev));
				}
			})
			.catch(() => {
				if (!cancelled) {
					setState((prev) => ({ ...prev, error: t("qrRenderError") }));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [state.qrUrl, t]);

	const startBind = useCallback(async () => {
		setState({ phase: "starting", qrAttempt: 0 });
		const unsub = await window.vetta.im.wechat.subscribeBind((event: ImWechatBindEvent) => {
			switch (event.kind) {
				case "qr":
					setState((prev) => ({
						...prev,
						phase: "waiting",
						qrUrl: event.url,
						qrDataUrl: undefined,
						qrAttempt: event.attempt,
						error: undefined,
					}));
					break;
				case "status":
					setState((prev) => {
						switch (event.status) {
							case "scanned":
								return { ...prev, phase: "scanned" };
							case "expired":
								return { ...prev, phase: "expired_refreshing" };
							case "redirected":
								return { ...prev, phase: "redirected" };
							case "confirmed":
								return { ...prev, phase: "confirmed" };
							case "failed":
								return { ...prev, phase: "failed", error: event.error ?? t("bindFailedGeneric") };
							case "cancelled":
								return { ...prev, phase: "failed", error: t("bindCanceled") };
							default:
								return prev;
						}
					});
					break;
				case "bound":
					onConfirmedRefresh();
					setState((prev) => ({ ...prev, phase: "confirmed" }));
					setTimeout(() => onOpenChange(false), 1500);
					break;
				case "unbound":
					setState(initialWechatDialogState);
					onConfirmedRefresh();
					break;
			}
		});
		subUnsubRef.current = unsub;

		const result = await window.vetta.im.wechat.startBind();
		if (!result.ok) {
			setState({
				phase: "failed",
				qrAttempt: 0,
				error: result.error ?? t("bindStartFailed"),
			});
		}
	}, [onConfirmedRefresh, onOpenChange, t]);

	useEffect(() => {
		if (open && !bound && state.phase === "idle") {
			void startBind();
		}
	}, [bound, open, startBind, state.phase]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{bound ? t("wechatTitle") : t("wechatBindTitle")}</DialogTitle>
					<DialogDescription>{bound ? t("wechatBoundDesc") : t("wechatBindDesc")}</DialogDescription>
				</DialogHeader>

				{bound ? (
					<div className="space-y-3 py-2 text-[12px] text-foreground">
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_bot_id</div>
							<div className="break-all font-mono text-[11px]">{ilinkBotId ?? "—"}</div>
						</div>
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_user_id</div>
							<div className="break-all font-mono text-[11px]">{ilinkUserId ?? "—"}</div>
						</div>
					</div>
				) : (
					<WechatBindBody state={state} onStart={() => void startBind()} />
				)}

				<DialogFooter className="gap-2">
					{bound ? (
						<>
							<Button variant="destructive" onClick={onLogout}>
								{t("unbindAccount")}
							</Button>
							<Button variant="primary" onClick={() => onOpenChange(false)}>
								{t("bindDone")}
							</Button>
						</>
					) : (
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							{t("cancel")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function WechatBindBody({
	state,
	onStart,
}: {
	state: WechatDialogState;
	onStart: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	if (state.phase === "idle" || state.phase === "starting") {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center text-[12px] text-muted-foreground">
				<span className="icon-[mdi--loading] h-6 w-6 animate-spin" />
				<div>{t("bindGenerating")}</div>
			</div>
		);
	}

	if (state.phase === "failed") {
		return (
			<div className="flex flex-col items-center gap-3 py-6 text-center">
				<span className="icon-[mdi--close-circle] h-10 w-10 text-destructive" />
				<div className="text-[12px] text-destructive">{state.error ?? t("bindFailed")}</div>
				<Button variant="primary" onClick={onStart}>
					{t("retry")}
				</Button>
			</div>
		);
	}

	if (state.phase === "confirmed") {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-center">
				<span className="icon-[mdi--check-circle] h-12 w-12 text-emerald-400" />
				<div className="text-[13px] font-medium text-foreground">{t("bindSuccessTitle")}</div>
				<div className="text-[11px] text-muted-foreground">{t("bindSuccessDesc")}</div>
			</div>
		);
	}

	const progressLabel = (() => {
		switch (state.phase) {
			case "scanned":
				return t("scanWechatConfirm");
			case "expired_refreshing":
				return t("qrExpired");
			case "redirected":
				return t("switchingRoute");
			default:
				return state.qrAttempt > 1 ? t("scanQrHintN", { n: state.qrAttempt }) : t("scanQrHint");
		}
	})();

	return (
		<div className="flex flex-col items-center gap-3 py-3">
			<div className="flex h-[252px] w-[252px] items-center justify-center rounded-md border border-border bg-white p-1.5">
				{state.qrDataUrl ? (
					<img src={state.qrDataUrl} alt="WeChat QR" className="h-full w-full" />
				) : (
					<span className="icon-[mdi--loading] h-8 w-8 animate-spin text-muted-foreground" />
				)}
			</div>
			<div className="text-center text-[12px] text-muted-foreground">{progressLabel}</div>
			<div className="text-center text-[11px] text-muted-foreground">{t("scanToAuthorize")}</div>
		</div>
	);
}
