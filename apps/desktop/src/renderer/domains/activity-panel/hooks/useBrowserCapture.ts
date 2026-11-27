import { useShortcutScope } from "@shared/shortcuts";
import { activeInputDraftKeyAtom, browserCapturesAtom, selectedSpaceAtom, showToast } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type BrowserCapture,
	type BrowserCaptureApi,
	browserCaptureSchema,
	type CaptureRect,
} from "../../../../shared/browser-capture";
import { frameBrowserScreenshot } from "../services/capture-image";

type Inspection = Awaited<ReturnType<BrowserCaptureApi["inspect"]>>;
export interface CaptureGuest extends HTMLElement {
	getWebContentsId(): number;
	getURL(): string;
}

export function useBrowserCapture(guestRef: RefObject<CaptureGuest | null>, workspaceId: string) {
	const { t } = useTranslation("chat");
	const draftKey = useAtomValue(activeInputDraftKeyAtom);
	const space = useAtomValue(selectedSpaceAtom);
	const addCaptures = useSetAtom(browserCapturesAtom);
	const [mode, setMode] = useState<"element" | "region" | null>(null);
	const [inspection, setInspection] = useState<Inspection | null>(null);
	const [level, setLevel] = useState(0);
	const [locked, setLocked] = useState(false);
	const [region, setRegion] = useState<CaptureRect | null>(null);
	const [preview, setPreview] = useState<BrowserCapture | null>(null);
	const [busy, setBusy] = useState(false);
	const generation = useRef(0);
	const query = useRef(0);
	const pendingInspection = useRef<{ x: number; y: number; lock: boolean } | null>(null);
	const inspectionInFlight = useRef(false);
	const inspectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastInspectionStartedAt = useRef<number | null>(null);
	const flushInspectionRef = useRef<() => void>(() => {});
	const clearPendingInspection = useCallback(() => {
		pendingInspection.current = null;
		if (inspectionTimer.current !== null) {
			clearTimeout(inspectionTimer.current);
			inspectionTimer.current = null;
		}
	}, []);
	const currentOwner = `${workspaceId}:${space}:${draftKey}`;
	const ownerRef = useRef(currentOwner);
	ownerRef.current = currentOwner;
	const selectionRef = useRef({ mode, preview });
	selectionRef.current = { mode, preview };
	const fail = useCallback(() => showToast({ variant: "error", message: t("browserCapture.failed") }), [t]);
	const flushInspection = useCallback(() => {
		if (inspectionInFlight.current) return;
		const request = pendingInspection.current;
		if (!request) return;
		const delay =
			request.lock || lastInspectionStartedAt.current === null
				? 0
				: Math.max(0, 50 - (Date.now() - lastInspectionStartedAt.current));
		if (delay > 0) {
			if (inspectionTimer.current === null) {
				inspectionTimer.current = setTimeout(() => {
					inspectionTimer.current = null;
					flushInspectionRef.current();
				}, delay);
			}
			return;
		}
		if (mode !== "element" || (locked && !request.lock) || busy) {
			pendingInspection.current = null;
			return;
		}
		pendingInspection.current = null;
		inspectionInFlight.current = true;
		lastInspectionStartedAt.current = Date.now();
		const guest = guestRef.current;
		const sequence = ++query.current;
		const token = generation.current;
		if (!guest) {
			inspectionInFlight.current = false;
			return;
		}
		void Promise.resolve()
			.then(() => window.vetta.browserCapture.inspect(guest.getWebContentsId(), { x: request.x, y: request.y }))
			.then((result) => {
				if (token !== generation.current || sequence !== query.current) return;
				setInspection(result);
				setLevel(0);
				setLocked(request.lock && result.elements.length > 0);
			})
			.catch(() => {
				if (token === generation.current && sequence === query.current) fail();
			})
			.finally(() => {
				inspectionInFlight.current = false;
				if (pendingInspection.current) flushInspectionRef.current();
			});
	}, [busy, fail, guestRef, locked, mode]);
	flushInspectionRef.current = () => flushInspection();
	const cancel = useCallback(() => {
		generation.current++;
		query.current++;
		clearPendingInspection();
		setMode(null);
		setPreview(null);
		setInspection(null);
		setRegion(null);
		setBusy(false);
		setLocked(false);
	}, [clearPendingInspection]);
	useEffect(() => {
		void currentOwner;
		if (selectionRef.current.mode || selectionRef.current.preview) {
			cancel();
			showToast({ message: t("browserCapture.cancelled") });
		}
	}, [currentOwner, cancel, t]);
	useEffect(
		() => () => {
			generation.current++;
			clearPendingInspection();
		},
		[clearPendingInspection],
	);
	useEffect(() => {
		const guest = guestRef.current;
		if (!guest || !mode) return;
		const invalidate = () => {
			cancel();
			showToast({ message: t("browserCapture.changed") });
		};
		const navigate = (event: Event) => {
			if ("isMainFrame" in event && event.isMainFrame === false) return;
			invalidate();
		};
		guest.addEventListener("did-start-navigation", navigate);
		return () => {
			guest.removeEventListener("did-start-navigation", navigate);
		};
	}, [guestRef, mode, cancel, t]);
	useShortcutScope({
		id: "browser-capture",
		kind: "overlay",
		active: mode !== null || preview !== null,
		exclusive: true,
		bindings: [{ key: "escape", run: cancel }],
	});
	const start = () => {
		cancel();
		setMode("element");
		const token = generation.current;
		// Commit the selection surface before asking the guest process for its viewport.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const guest = guestRef.current;
				if (!guest || token !== generation.current) return;
				// Renderer HMR can run ahead of the preload loaded by the current window.
				if (!window.vetta.browserCapture?.inspect) {
					cancel();
					showToast({ variant: "error", message: t("browserCapture.restartRequired") });
					return;
				}
				void Promise.resolve()
					.then(() => window.vetta.browserCapture.inspect(guest.getWebContentsId(), { x: 0, y: 0 }))
					.then((result) => {
						if (token === generation.current) setInspection({ ...result, elements: [] });
					})
					.catch(() => {
						if (token === generation.current) {
							cancel();
							fail();
						}
					});
			});
		});
	};
	const inspect = (x: number, y: number, lock: boolean) => {
		if (mode !== "element" || (locked && !lock) || busy) return;
		if (pendingInspection.current?.lock && !lock) return;
		pendingInspection.current = { x, y, lock };
		if (lock && inspectionTimer.current !== null) {
			clearTimeout(inspectionTimer.current);
			inspectionTimer.current = null;
		}
		flushInspectionRef.current();
	};
	const confirm = async () => {
		const selected = mode === "element" ? inspection?.elements[level] : null;
		const rect = selected?.rect ?? region;
		const guest = guestRef.current;
		if (!rect || !inspection || !guest || busy) return;
		query.current++;
		setBusy(true);
		const token = generation.current,
			owner = ownerRef.current;
		try {
			const captured = await window.vetta.browserCapture.capture(guest.getWebContentsId(), inspection.url);
			const framed = await frameBrowserScreenshot(captured.data, rect, inspection.viewport);
			if (token !== generation.current || owner !== ownerRef.current) return;
			const id = crypto.randomUUID();
			const images = await window.vetta.dialog.persistImages("browser-capture", [
				{ id, data: framed.data, mimeType: "image/png" },
			]);
			if (token !== generation.current || owner !== ownerRef.current) return;
			setPreview(
				browserCaptureSchema.parse({
					version: 1,
					id,
					imagePath: images[0]?.path,
					url: inspection.url,
					title: inspection.title,
					mode,
					rect,
					viewport: inspection.viewport,
					width: framed.width,
					height: framed.height,
					element: selected?.element,
					note: "",
				}),
			);
			setMode(null);
			setBusy(false);
		} catch {
			if (token === generation.current) {
				setBusy(false);
				fail();
			}
		}
	};
	return {
		mode,
		preview,
		busy,
		inspection,
		locked,
		level,
		rect: mode === "element" ? (inspection?.elements[level]?.rect ?? null) : region,
		start,
		cancel,
		inspect,
		confirm,
		setRegion: (rect: CaptureRect) => {
			query.current++;
			clearPendingInspection();
			setMode("region");
			setLocked(false);
			setRegion(rect);
		},
		expand: () => setLevel((value) => Math.min(value + 1, (inspection?.elements.length ?? 1) - 1)),
		shrink: () => setLevel((value) => Math.max(0, value - 1)),
		add: (note: string) => {
			if (preview) {
				addCaptures((items) => [...items, { ...preview, note }]);
				cancel();
			}
		},
		scroll: (x: number, y: number, point: { x: number; y: number }) => {
			if (mode !== "element" || busy || !guestRef.current) return;
			query.current++;
			clearPendingInspection();
			setLocked(false);
			setInspection((value) => (value ? { ...value, elements: [] } : value));
			void window.vetta.browserCapture.scroll(guestRef.current.getWebContentsId(), { x, y, point }).catch(fail);
		},
	};
}
