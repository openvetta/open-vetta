// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { VirtuosoHandle } from "react-virtuoso";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessageFeedScrollModel } from "./useMessageFeedScrollModel";

describe("useMessageFeedScrollModel", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("stops the follow loop once the viewport is already at the bottom", () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);

		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: true,
				items: [{ id: "message-1" }],
				resetKey: "feed-1",
			}),
		);
		const element = document.createElement("div");
		Object.defineProperties(element, {
			scrollHeight: { configurable: true, value: 1000 },
			clientHeight: { configurable: true, value: 400 },
			scrollTop: { configurable: true, writable: true, value: 600 },
		});

		act(() => result.current.scrollerRef(element));
		act(() => result.current.onAtBottomChange(true));
		expect(frames).toHaveLength(1);

		act(() => frames.shift()?.(0));

		expect(frames).toHaveLength(0);
	});

	it("coalesces resize-follow corrections into one animation frame", () => {
		const frames: FrameRequestCallback[] = [];
		let notifyResize: (() => void) | undefined;
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: () => void) {
					notifyResize = callback;
				}
				observe() {}
				disconnect() {}
			},
		);

		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-1",
			}),
		);
		const element = document.createElement("div");
		Object.defineProperties(element, {
			scrollHeight: { configurable: true, value: 1200 },
			clientHeight: { configurable: true, value: 400 },
			scrollTop: { configurable: true, writable: true, value: 600 },
		});

		act(() => result.current.scrollerRef(element));
		frames.splice(0);
		act(() => {
			notifyResize?.();
			notifyResize?.();
		});

		expect(frames).toHaveLength(1);
		expect(element.scrollTop).toBe(600);

		act(() => frames.shift()?.(0));

		expect(element.scrollTop).toBe(800);
	});

	it("navigates an arbitrary feed item model without a chat message dependency", () => {
		const scrollToIndex = vi.fn();
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ logicalKey: "event-1" }],
				resetKey: "feed-1",
				getItemKey: (item) => item.logicalKey,
			}),
		);
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			scrollToIndex,
		} as unknown as VirtuosoHandle;

		act(() => result.current.scrollToItem(3));

		expect(scrollToIndex).toHaveBeenCalledWith({ index: 3, align: "start", behavior: "smooth" });
		expect(result.current.followOutput).toBe(false);
	});

	it("resolves an initial target through a scenario-provided logical key", () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		const scrollToIndex = vi.fn();
		const onInitialTargetHandled = vi.fn();
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ logicalKey: "first" }, { logicalKey: "target" }],
				resetKey: "feed-1",
				initialTargetKey: "target",
				getItemKey: (item) => item.logicalKey,
				onInitialTargetHandled,
			}),
		);
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			scrollToIndex,
		} as unknown as VirtuosoHandle;

		act(() => {
			for (const callback of frames.splice(0)) callback(0);
		});

		expect(onInitialTargetHandled).toHaveBeenCalledOnce();
		expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, align: "center", behavior: "smooth" });
	});

	it("stops following the tail when the user starts browsing history", () => {
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-1",
			}),
		);
		const element = document.createElement("div");

		act(() => result.current.scrollerRef(element));

		expect(result.current.followOutput).toBe("auto");

		act(() => element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 })));

		expect(result.current.followOutput).toBe(false);

		act(() => result.current.onAtBottomChange(true));

		expect(result.current.followOutput).toBe(false);

		act(() => element.dispatchEvent(new Event("scrollend")));

		expect(result.current.followOutput).toBe(false);
	});

	it("re-enables tail following only after the user scrolls downward to the bottom", () => {
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-return-bottom",
			}),
		);
		const element = document.createElement("div");

		act(() => result.current.scrollerRef(element));
		act(() => element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 })));
		act(() => result.current.onAtBottomChange(true));
		expect(result.current.followOutput).toBe(false);

		act(() => element.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 })));
		act(() => result.current.onAtBottomChange(true));

		expect(result.current.followOutput).toBe("auto");
	});

	it("recognizes an upward scrollbar drag as history-browsing intent", () => {
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-pointer",
			}),
		);
		const element = document.createElement("div");
		Object.defineProperty(element, "scrollTop", { configurable: true, writable: true, value: 600 });

		act(() => result.current.scrollerRef(element));
		act(() => element.dispatchEvent(new MouseEvent("pointerdown", { button: 0 })));
		element.scrollTop = 400;
		act(() => element.dispatchEvent(new Event("scroll")));

		expect(result.current.followOutput).toBe(false);
	});

	it("does not read scrollTop on the wheel-scroll hot path", () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-wheel-layout",
			}),
		);
		const readScrollTop = vi.fn(() => 600);
		const element = document.createElement("div");
		Object.defineProperty(element, "scrollTop", { configurable: true, get: readScrollTop });

		act(() => result.current.scrollerRef(element));
		readScrollTop.mockClear();
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
			element.dispatchEvent(new Event("scroll"));
		});

		expect(readScrollTop).not.toHaveBeenCalled();
	});

	it("captures state once after scrolling settles instead of on every scroll frame", () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-scroll-capture",
			}),
		);
		const getState = vi.fn();
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			getState,
		} as unknown as VirtuosoHandle;
		const element = document.createElement("div");

		act(() => result.current.scrollerRef(element));
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
			element.dispatchEvent(new Event("scroll"));
			element.dispatchEvent(new Event("scroll"));
			element.dispatchEvent(new Event("scroll"));
		});
		expect(getState).not.toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(250));

		expect(getState).toHaveBeenCalledOnce();
	});

	it("coalesces virtual total-height changes and pins the tail only while follow intent is active", () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result } = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }],
				resetKey: "feed-height",
			}),
		);
		const element = document.createElement("div");
		Object.defineProperties(element, {
			scrollHeight: { configurable: true, writable: true, value: 1200 },
			clientHeight: { configurable: true, value: 400 },
			scrollTop: { configurable: true, writable: true, value: 600 },
		});

		act(() => result.current.scrollerRef(element));
		frames.splice(0);
		act(() => {
			result.current.onTotalListHeightChange(1100);
			result.current.onTotalListHeightChange(1200);
		});

		expect(frames).toHaveLength(1);
		act(() => frames.shift()?.(0));
		expect(element.scrollTop).toBe(800);

		act(() => element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 })));
		Object.defineProperty(element, "scrollHeight", { configurable: true, writable: true, value: 1600 });
		act(() => result.current.onTotalListHeightChange(1600));

		expect(frames).toHaveLength(0);
		expect(element.scrollTop).toBe(800);
	});

	it("does not leak history-browsing follow state into the next session", () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const { result, rerender } = renderHook(
			({ resetKey }) =>
				useMessageFeedScrollModel({
					active: false,
					items: [{ id: "message-1" }],
					resetKey,
				}),
			{ initialProps: { resetKey: "feed-a" } },
		);
		const element = document.createElement("div");

		act(() => result.current.scrollerRef(element));
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
			element.dispatchEvent(new Event("scroll"));
		});
		expect(result.current.followOutput).toBe(false);

		rerender({ resetKey: "feed-b" });
		act(() => vi.advanceTimersByTime(250));

		expect(result.current.followOutput).toBe("auto");
	});

	it("keeps one end-aligned tail location while an empty session hydrates", () => {
		const { result, rerender } = renderHook(
			({ items }: { items: Array<{ id: string }> }) =>
				useMessageFeedScrollModel({
					active: false,
					items,
					resetKey: "progressive-feed",
				}),
			{ initialProps: { items: [] as Array<{ id: string }> } },
		);

		expect(result.current.initialTopMostItemIndex).toEqual({ index: "LAST", align: "end" });

		rerender({ items: Array.from({ length: 25 }, (_, index) => ({ id: `message-${index}` })) });

		expect(result.current.initialTopMostItemIndex).toEqual({ index: "LAST", align: "end" });
	});

	it("does not issue a second tail scroll when switching sessions", () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		const items = [{ id: "message-1" }];
		const { result, rerender } = renderHook(
			({ resetKey }) =>
				useMessageFeedScrollModel({
					active: false,
					items,
					resetKey,
				}),
			{ initialProps: { resetKey: "feed-a" } },
		);
		const scrollToIndex = vi.fn();
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			scrollToIndex,
		} as unknown as VirtuosoHandle;
		frames.splice(0);

		rerender({ resetKey: "feed-b" });
		act(() => {
			for (const callback of frames.splice(0)) callback(0);
		});

		expect(result.current.initialTopMostItemIndex).toEqual({ index: "LAST", align: "end" });
		expect(scrollToIndex).not.toHaveBeenCalled();
	});

	it("caches measured item state and exposes it for a later remount", () => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const resetKey = `feed-state-${Math.random()}`;
		const snapshot = {
			scrollTop: 240,
			ranges: [{ startIndex: 0, endIndex: 1, size: 180 }],
		};
		const first = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }, { id: "message-2" }],
				resetKey,
			}),
		);
		(first.result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			getState: (callback: (state: typeof snapshot) => void) => callback(snapshot),
		} as unknown as VirtuosoHandle;
		const element = document.createElement("div");
		act(() => first.result.current.scrollerRef(element));
		// The reader scrolls up into the history: that position is worth coming back to.
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
		});
		first.unmount();

		const second = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "message-1" }, { id: "message-2" }],
				resetKey,
			}),
		);

		expect(second.result.current).toMatchObject({
			followOutput: false,
			restoreStateFrom: snapshot,
			initialTopMostItemIndex: undefined,
		});
		second.unmount();

		const progressive = renderHook(
			({ items }: { items: Array<{ id: string }> }) =>
				useMessageFeedScrollModel({
					active: false,
					items,
					resetKey,
				}),
			{ initialProps: { items: [] as Array<{ id: string }> } },
		);

		expect(progressive.result.current.restoreStateFrom).toBeUndefined();

		progressive.rerender({ items: [{ id: "message-1" }, { id: "message-2" }] });

		expect(progressive.result.current.restoreStateFrom).toBeUndefined();
		progressive.unmount();
	});

	it("does not remember a position while the feed follows its tail", () => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		const resetKey = "feed-tail-without-reader-intent";
		const items = [{ id: "message-1" }, { id: "message-2" }];
		const first = renderHook(() => useMessageFeedScrollModel({ active: false, items, resetKey }));
		// Mid-way to the bottom while heights are still being measured.
		(first.result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			getState: (callback: (state: { scrollTop: number; ranges: [] }) => void) =>
				callback({ scrollTop: 120, ranges: [] }),
		} as unknown as VirtuosoHandle;
		act(() => first.result.current.scrollerRef(document.createElement("div")));
		first.unmount();

		const second = renderHook(() => useMessageFeedScrollModel({ active: false, items, resetKey }));

		expect(second.result.current).toMatchObject({
			followOutput: "auto",
			restoreStateFrom: undefined,
			initialTopMostItemIndex: { index: "LAST", align: "end" },
		});
		second.unmount();
	});

	it("forgets a chosen history position after the reader returns to the bottom", () => {
		stubScrollMeasurements();
		const input = { active: false, items: [{ id: "one" }, { id: "two" }], resetKey: "feed-return-to-tail" };
		const first = renderHook(() => useMessageFeedScrollModel(input));
		const snapshot = { scrollTop: 240, ranges: [] };
		first.result.current.virtuosoRef.current = {
			getState: (callback: (value: typeof snapshot) => void) => callback(snapshot),
		} as unknown as VirtuosoHandle;
		const element = document.createElement("div");
		act(() => first.result.current.scrollerRef(element));
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
			element.dispatchEvent(new Event("scrollend"));
		});
		expect(first.result.current.followOutput).toBe(false);

		act(() => element.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 })));
		act(() => first.result.current.onAtBottomChange(true));
		expect(first.result.current.followOutput).toBe("auto");
		first.unmount();

		const reopened = renderHook(() => useMessageFeedScrollModel(input));
		expect(reopened.result.current.restoreStateFrom).toBeUndefined();
		expect(reopened.result.current.followOutput).toBe("auto");
		reopened.unmount();
	});

	it("keeps the reader's position for its session while a different session follows its tail", () => {
		stubScrollMeasurements();
		const items = [{ id: "one" }, { id: "two" }];
		const { result, rerender, unmount } = renderHook(
			({ resetKey }) => useMessageFeedScrollModel({ active: false, items, resetKey }),
			{ initialProps: { resetKey: "reader-session-a" } },
		);
		const snapshot = { scrollTop: 240, ranges: [] };
		result.current.virtuosoRef.current = {
			getState: (callback: (value: typeof snapshot) => void) => callback(snapshot),
		} as unknown as VirtuosoHandle;
		const element = document.createElement("div");
		act(() => result.current.scrollerRef(element));
		act(() => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
			element.dispatchEvent(new Event("scrollend"));
		});

		rerender({ resetKey: "reader-session-b" });
		expect(result.current.followOutput).toBe("auto");
		act(() => element.dispatchEvent(new Event("scrollend")));
		rerender({ resetKey: "reader-session-a" });
		expect(result.current.restoreStateFrom).toEqual(snapshot);
		expect(result.current.followOutput).toBe(false);
		unmount();

		const otherSession = renderHook(() =>
			useMessageFeedScrollModel({ active: false, items, resetKey: "reader-session-b" }),
		);
		expect(otherSession.result.current.restoreStateFrom).toBeUndefined();
		expect(otherSession.result.current.followOutput).toBe("auto");
		otherSession.unmount();
	});

	it("does not restore a chosen position onto replacement history with the same row count", () => {
		stubScrollMeasurements();
		const resetKey = "reader-history-replacement";
		const getItemKey = (item: { id: string }) => item.id;
		const first = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "old-one" }, { id: "old-two" }],
				resetKey,
				getItemKey,
			}),
		);
		first.result.current.virtuosoRef.current = {
			getState: (callback: (value: { scrollTop: number; ranges: [] }) => void) =>
				callback({ scrollTop: 240, ranges: [] }),
			scrollToIndex: vi.fn(),
		} as unknown as VirtuosoHandle;
		act(() => first.result.current.scrollToItem(0));
		first.unmount();

		const replaced = renderHook(() =>
			useMessageFeedScrollModel({
				active: false,
				items: [{ id: "new-one" }, { id: "new-two" }],
				resetKey,
				getItemKey,
			}),
		);
		expect(replaced.result.current.restoreStateFrom).toBeUndefined();
		expect(replaced.result.current.initialTopMostItemIndex).toEqual({ index: "LAST", align: "end" });
		replaced.unmount();
	});

	it.each(["PageUp", "Home", "ArrowUp"])("remembers native %s scrolling without overriding the browser key", (key) => {
		stubScrollMeasurements();
		const input = { active: false, items: [{ id: "one" }, { id: "two" }], resetKey: `keyboard-reader-${key}` };
		const first = renderHook(() => useMessageFeedScrollModel(input));
		const snapshot = { scrollTop: 240, ranges: [] };
		first.result.current.virtuosoRef.current = {
			getState: (callback: (value: typeof snapshot) => void) => callback(snapshot),
		} as unknown as VirtuosoHandle;
		const element = document.createElement("div");
		element.tabIndex = 0;
		Object.defineProperties(element, {
			scrollHeight: { value: 1200 },
			clientHeight: { value: 400 },
			scrollTop: { writable: true, value: 800 },
		});
		act(() => first.result.current.scrollerRef(element));
		const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
		act(() => {
			element.dispatchEvent(event);
			// jsdom does not perform native keyboard scrolling; simulate only its resulting position.
			element.scrollTop = 240;
			element.dispatchEvent(new Event("scroll"));
			element.dispatchEvent(new Event("scrollend"));
		});
		expect(event.defaultPrevented).toBe(false);
		expect(first.result.current.followOutput).toBe(false);
		first.unmount();

		const reopened = renderHook(() => useMessageFeedScrollModel(input));
		expect(reopened.result.current.restoreStateFrom).toEqual(snapshot);
		expect(reopened.result.current.followOutput).toBe(false);
		reopened.unmount();
	});

	it("leaves descendant controls, handled shortcuts and composing keys outside native feed scrolling", () => {
		stubScrollMeasurements();
		const { result, unmount } = renderHook(() =>
			useMessageFeedScrollModel({ active: false, items: [{ id: "one" }], resetKey: "keyboard-control-boundaries" }),
		);
		const element = document.createElement("div");
		element.tabIndex = 0;
		act(() => result.current.scrollerRef(element));
		for (const tag of ["input", "textarea", "select", "button", "div"]) {
			const control = document.createElement(tag);
			if (tag === "div") control.contentEditable = "true";
			element.append(control);
			act(() => control.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
			expect(result.current.followOutput).toBe("auto");
			control.remove();
		}
		for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
			act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", ...init })));
			expect(result.current.followOutput).toBe("auto");
		}
		const handled = new KeyboardEvent("keydown", { key: "PageUp", cancelable: true });
		handled.preventDefault();
		act(() => element.dispatchEvent(handled));
		expect(result.current.followOutput).toBe("auto");
		unmount();
	});

	it.each(["PageDown", "End", "ArrowDown"])(
		"resumes following only when native %s scrolling reaches the bottom",
		(key) => {
			stubScrollMeasurements();
			const { result, unmount } = renderHook(() =>
				useMessageFeedScrollModel({ active: false, items: [{ id: "one" }], resetKey: `keyboard-return-${key}` }),
			);
			const element = document.createElement("div");
			element.tabIndex = 0;
			act(() => result.current.scrollerRef(element));
			act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" })));
			expect(result.current.followOutput).toBe(false);
			act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key })));
			expect(result.current.followOutput).toBe(false);
			act(() => result.current.onAtBottomChange(true));
			expect(result.current.followOutput).toBe("auto");
			unmount();
		},
	);

	it("observes native Shift+Space and Space without taking over their default scrolling", () => {
		stubScrollMeasurements();
		const { result, unmount } = renderHook(() =>
			useMessageFeedScrollModel({ active: false, items: [{ id: "one" }], resetKey: "keyboard-space-scroll" }),
		);
		const element = document.createElement("div");
		element.tabIndex = 0;
		act(() => result.current.scrollerRef(element));
		const up = new KeyboardEvent("keydown", { key: " ", shiftKey: true, cancelable: true });
		act(() => element.dispatchEvent(up));
		expect(result.current.followOutput).toBe(false);
		expect(up.defaultPrevented).toBe(false);
		const down = new KeyboardEvent("keydown", { key: " ", cancelable: true });
		act(() => element.dispatchEvent(down));
		expect(result.current.followOutput).toBe(false);
		expect(down.defaultPrevented).toBe(false);
		act(() => result.current.onAtBottomChange(true));
		expect(result.current.followOutput).toBe("auto");
		unmount();
	});
});

function stubScrollMeasurements(): void {
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn(() => 1),
	);
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
}
