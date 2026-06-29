import { type RefObject, useEffect, useRef } from "react";
import type { PetContentBounds } from "../../../../shared/pet-ipc";

function getElementBounds(element: HTMLElement): { x: number; y: number; width: number; height: number } | undefined {
	const bounds = element.getBoundingClientRect();
	if (bounds.width <= 0 || bounds.height <= 0) return undefined;
	return {
		x: Math.round(bounds.left),
		y: Math.round(bounds.top),
		width: Math.round(bounds.width),
		height: Math.round(bounds.height),
	};
}

function getContentBounds(content: HTMLElement, anchor: HTMLElement): PetContentBounds | undefined {
	const elements = [content, ...Array.from(content.querySelectorAll("*"))];
	const anchorBounds = getElementBounds(anchor);
	if (!anchorBounds) return undefined;
	let left = anchorBounds.x;
	let top = anchorBounds.y;
	let right = anchorBounds.x + anchorBounds.width;
	let bottom = anchorBounds.y + anchorBounds.height;

	for (const item of elements) {
		if (!(item instanceof HTMLElement)) continue;
		const bounds = getElementBounds(item);
		if (!bounds) continue;
		left = Math.min(left, bounds.x);
		top = Math.min(top, bounds.y);
		right = Math.max(right, bounds.x + bounds.width);
		bottom = Math.max(bottom, bounds.y + bounds.height);
	}

	return {
		bounds: {
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		},
		anchor: anchorBounds,
	};
}

export function usePetAutoContentSize({
	contentRef,
	targetRef,
	debugFrame,
	observeKey,
}: {
	contentRef: RefObject<HTMLElement | null>;
	targetRef: RefObject<HTMLElement | null>;
	debugFrame: boolean;
	observeKey: unknown;
}): void {
	const lastBoundsKeyRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		void observeKey;
		lastBoundsKeyRef.current = undefined;
		if (debugFrame) return;

		let animationFrame: number | undefined;
		let resizeObserver: ResizeObserver | undefined;

		const reportSize = () => {
			animationFrame = undefined;
			const content = contentRef.current;
			const target = targetRef.current;
			if (!content || !target) return;
			const nextBounds = getContentBounds(content, target);
			if (!nextBounds) return;
			const nextKey = JSON.stringify(nextBounds);
			if (lastBoundsKeyRef.current === nextKey) return;
			lastBoundsKeyRef.current = nextKey;
			void window.vettaPet?.setContentSize(nextBounds);
		};

		const scheduleReport = () => {
			if (animationFrame != null) return;
			animationFrame = window.requestAnimationFrame(reportSize);
		};

		const observeTarget = () => {
			resizeObserver?.disconnect();
			resizeObserver = new ResizeObserver(scheduleReport);
			const content = contentRef.current;
			const target = targetRef.current;
			if (!content || !target) return;
			resizeObserver.observe(content);
			resizeObserver.observe(target);
			for (const item of content.querySelectorAll("*")) {
				resizeObserver.observe(item);
			}
		};

		observeTarget();
		const mutationObserver = new MutationObserver(() => {
			observeTarget();
			scheduleReport();
		});
		if (contentRef.current) {
			mutationObserver.observe(contentRef.current, {
				childList: true,
				subtree: true,
			});
		}
		scheduleReport();
		window.addEventListener("resize", scheduleReport);

		return () => {
			if (animationFrame != null) {
				window.cancelAnimationFrame(animationFrame);
			}
			resizeObserver?.disconnect();
			mutationObserver.disconnect();
			window.removeEventListener("resize", scheduleReport);
		};
	}, [contentRef, targetRef, debugFrame, observeKey]);
}
