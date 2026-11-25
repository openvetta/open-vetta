// @vitest-environment jsdom

import { inputValueAtom, promptSuggestionsAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { inputPlaceholderVisibleAtom } from "./editor/tokens/projectionAtoms";
import { useInlinePromptSuggestion } from "./useInlinePromptSuggestion";

const RUNTIME = "runtime-1";

function setup(options: { streaming?: boolean; value?: string } = {}) {
	const store = createStore();
	store.set(inputValueAtom, options.value ?? "");
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	const hook = renderHook(
		() =>
			useInlinePromptSuggestion({
				runtimeId: RUNTIME,
				hasSession: true,
				isStreaming: options.streaming ?? false,
				placeholderVisible: useAtomValue(inputPlaceholderVisibleAtom),
			}),
		{ wrapper },
	);
	const predict = (list: string[]) => act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: list }));
	const type = (value: string) => act(() => store.set(inputValueAtom, value));
	return { store, hook, predict, type };
}

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
	return new KeyboardEvent("keydown", { cancelable: true, ...init });
}

describe("useInlinePromptSuggestion", () => {
	it("shows the first prediction in an empty input and Tab fills it in without sending", () => {
		const { store, hook, predict } = setup();
		predict(["Run the tests", "Open a PR"]);
		expect(hook.result.current.visible).toBe(true);
		expect(hook.result.current.suggestion).toBe("Run the tests");

		const tab = key({ key: "Tab" });
		let handled = false;
		act(() => {
			handled = hook.result.current.handleKeyDown(tab);
		});
		expect(handled).toBe(true);
		expect(tab.defaultPrevented).toBe(true);
		expect(store.get(inputValueAtom)).toBe("Run the tests");
		// 填入后不再作为提示显示。
		expect(hook.result.current.visible).toBe(false);
	});

	it("typing anything rejects it, and clearing the input does not bring it back", () => {
		const { hook, predict, type } = setup();
		predict(["Run the tests"]);
		type("h");
		expect(hook.result.current.visible).toBe(false);
		type("");
		expect(hook.result.current.suggestion).toBeUndefined();
		expect(hook.result.current.visible).toBe(false);
	});

	it("Esc rejects it for this round; the next round of predictions shows again", () => {
		const { hook, predict } = setup();
		predict(["Run the tests"]);
		const esc = key({ key: "Escape" });
		act(() => {
			expect(hook.result.current.handleKeyDown(esc)).toBe(true);
		});
		expect(esc.defaultPrevented).toBe(true);
		expect(hook.result.current.visible).toBe(false);

		predict(["Run the tests"]);
		expect(hook.result.current.visible).toBe(true);
	});

	it("a prediction that arrives while the user is already typing is dropped", () => {
		const { hook, predict, type } = setup({ value: "draft" });
		predict(["Run the tests"]);
		type("");
		expect(hook.result.current.visible).toBe(false);
	});

	it("leaves Tab alone when nothing is shown, with modifiers, or while streaming", () => {
		const idle = setup();
		act(() => {
			expect(idle.hook.result.current.handleKeyDown(key({ key: "Tab" }))).toBe(false);
		});

		const withShift = setup();
		withShift.predict(["Run the tests"]);
		act(() => {
			expect(withShift.hook.result.current.handleKeyDown(key({ key: "Tab", shiftKey: true }))).toBe(false);
		});

		const streaming = setup({ streaming: true });
		streaming.predict(["Run the tests"]);
		expect(streaming.hook.result.current.visible).toBe(false);
		act(() => {
			expect(streaming.hook.result.current.handleKeyDown(key({ key: "Tab" }))).toBe(false);
		});
	});
});
