// @vitest-environment jsdom

import { defaultConversationCwdAtom, scheduledTasksAtom } from "@shared/store/atoms";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationTaskInput } from "../../../../shared/automation";
import { AutomationDetailPane } from "./AutomationDetailPane";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate, i18n: { language: "en" } }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("automation creation with an optional title", () => {
	it("lets the user enter the task and create it without entering the same words as a title", async () => {
		const createTask = vi.fn(async (input: AutomationTaskInput) => ({
			...input,
			id: "task-created",
			createdAt: 1,
			updatedAt: 1,
			lastRunAt: null,
			lastRunStatus: null,
		}));
		vi.stubGlobal("vetta", {
			scheduler: { createTask, onTaskEvent: () => () => undefined },
			webhook: { list: async () => [] },
			skills: { list: async () => [] },
			models: { get: async () => ({ providers: {} }), fetchRemote: async () => ({ providers: {} }) },
		});
		const store = createStore();
		store.set(defaultConversationCwdAtom, "/workspace/project");
		const onCreated = vi.fn();
		const user = userEvent.setup();
		render(
			<Provider store={store}>
				<AutomationDetailPane
					pane={{ kind: "create", draft: undefined, key: 1 }}
					onClose={vi.fn()}
					onCreated={onCreated}
				/>
			</Provider>,
		);
		const submit = screen.getByRole("button", { name: "detail.create" }) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		await user.type(
			screen.getByPlaceholderText("form.promptPlaceholder"),
			"Review today’s changes\nSummarize the risks",
		);
		expect((screen.getByRole("textbox", { name: "form.name" }) as HTMLInputElement).value).toBe("");
		expect(submit.disabled).toBe(false);
		await user.click(submit);
		await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
		expect(store.get(scheduledTasksAtom)).toEqual([
			expect.objectContaining({
				name: "Review today’s changes",
				prompt: "Review today’s changes\nSummarize the risks",
			}),
		]);
	});
});
