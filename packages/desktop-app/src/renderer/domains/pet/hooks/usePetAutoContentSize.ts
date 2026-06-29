import { type RefObject, useEffect, useRef } from "react";
import { normalizePetSize } from "../../../../shared/pet-config";

function getContentSize(element: HTMLElement): number {
	const elements = [element, ...Array.from(element.querySelectorAll("*"))];
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;

	for (const item of elements) {
		const bounds = item.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) continue;
		left = Math.min(left, bounds.left);
		top = Math.min(top, bounds.top);
		right = Math.max(right, bounds.right);
		bottom = Math.max(bottom, bounds.bottom);
	}

	if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
		const fallbackBounds = element.getBoundingClientRect();
		return normalizePetSize(Math.max(fallbackBounds.width, fallbackBounds.height));
	}

	return normalizePetSize(Math.ceil(Math.max(right - left, bottom - top)));
}

export function usePetAutoContentSize({
	contentRef,
	debugFrame,
}: {
	contentRef: RefObject<HTMLElement | null>;
	debugFrame: boolean;
}): void {
	const lastSizeRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		lastSizeRef.current = undefined;
		if (debugFrame) return;

		let animationFrame: number | undefined;
		let resizeObserver: ResizeObserver | undefined;
		let mutationObserver: MutationObserver | undefined;

		const reportSize = () => {
			animationFrame = undefined;
			const content = contentRef.current;
			if (!content) return;
			const nextSize = getContentSize(content);
			if (lastSizeRef.current === nextSize) return;
			lastSizeRef.current = nextSize;
			void window.vettaPet?.setContentSize(nextSize);
		};

		const scheduleReport = () => {
			if (animationFrame != null) return;
			animationFrame = window.requestAnimationFrame(reportSize);
		};

		const observeContent = () => {
			resizeObserver?.disconnect();
			resizeObserver = new ResizeObserver(scheduleReport);
			const content = contentRef.current;
			if (!content) return;
			resizeObserver.observe(content);
			for (const item of content.querySelectorAll("*")) {
				resizeObserver.observe(item);
			}
		};

		observeContent();
		mutationObserver = new MutationObserver(() => {
			observeContent();
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
			mutationObserver?.disconnect();
			window.removeEventListener("resize", scheduleReport);
		};
	}, [contentRef, debugFrame]);
}
