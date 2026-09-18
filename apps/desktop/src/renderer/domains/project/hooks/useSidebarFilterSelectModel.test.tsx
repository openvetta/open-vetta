// @vitest-environment jsdom
import { grokSessionImportEnabledAtom } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_CONVERSATION_FILTER_OPTIONS,
	useDefaultConversationFilterSelectModel,
} from "./useSidebarFilterSelectModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe("default conversation source options", () => {
	it("keeps Agent Teams inside their projected conversation lists", () => {
		expect(DEFAULT_CONVERSATION_FILTER_OPTIONS.map((option) => option.value)).toEqual(["conversation", "claw"]);
	});

	it("adds the external-tools filter only after Grok import is enabled", () => {
		const store = createStore();
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const disabled = renderHook(() => useDefaultConversationFilterSelectModel(), { wrapper });
		expect(disabled.result.current.options.map((option) => option.value)).not.toContain("external");

		store.set(grokSessionImportEnabledAtom, true);
		const enabled = renderHook(() => useDefaultConversationFilterSelectModel(), { wrapper });
		expect(enabled.result.current.options.map((option) => option.value)).toContain("external");
	});
});
