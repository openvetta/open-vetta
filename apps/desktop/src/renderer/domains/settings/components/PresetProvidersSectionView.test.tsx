// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@vetta-org/theme-ui/settings", () => ({
	PresetProvidersSectionView: ({ rows }: { rows: ReactNode }) => <div>{rows}</div>,
}));

vi.mock("./PresetProviderRow", () => ({
	PresetProviderRow: ({
		row,
		subscriptionLogin,
	}: {
		row: { id: string };
		subscriptionLogin?: { loginLabel: string; onLogin: () => void };
	}) => (
		<div>
			<span>{row.id}</span>
			{subscriptionLogin ? (
				<button type="button" onClick={subscriptionLogin.onLogin}>
					{subscriptionLogin.loginLabel}
				</button>
			) : null}
		</div>
	),
}));

vi.mock("./GrokSubscriptionDialog", () => ({
	GrokSubscriptionDialog: ({
		state,
		onCancel,
	}: {
		state: { open: boolean; userCode: string };
		onCancel: () => void;
	}) =>
		state.open ? (
			<div>
				<span>{state.userCode || "waiting"}</span>
				<button type="button" onClick={onCancel}>
					cancel-dialog
				</button>
			</div>
		) : null,
}));

import { PresetProvidersSectionView } from "./PresetProvidersSectionView";

function labels(): PresetProvidersSectionModel["labels"] {
	return {
		title: "title",
		loading: "loading",
		noPresetProviders: "none",
		enabled: "enabled",
		deprecated: "deprecated",
		collapseModels: "collapseModels",
		viewModels: "viewModels",
		modelsCount: (count) => String(count),
		collapse: "collapse",
		cancel: "cancel",
		changeKey: "changeKey",
		remove: "remove",
		enable: "enable",
		apiKeyDirect: () => "key",
		apiKeyPlaceholder: "placeholder",
		encryptedApiKeyPlaceholder: "encrypted",
		save: "save",
		noModels: "noModels",
		noMatchingModels: "noMatchingModels",
		searchModels: (provider) => `search:${provider}`,
		clearModelSearch: "clearModelSearch",
		modelListLabel: (provider) => `list:${provider}`,
		thinking: "thinking",
		perMillionTokens: "perMillion",
		refreshModels: "refresh",
		refreshingModels: "refreshing",
		refreshCatalog: "catalog",
		copyApiKey: "copy",
	};
}

function grokRow(): PresetProvidersSectionModel["rows"][number] {
	return {
		id: "grok",
		displayName: "Grok",
		api: "openai-completions",
		baseUrl: "https://api.x.ai/v1",
		icon: "grok",
		models: [],
		modelRows: [],
		offline: false,
		adopted: false,
		isOpen: false,
		isExpanded: false,
		refreshing: false,
		hasApiKey: false,
		modelsError: null,
	};
}

describe("PresetProvidersSectionView SuperGrok login", () => {
	it("puts SuperGrok login on the Grok row and opens the device-code dialog", async () => {
		const onGrokLogin = vi.fn(async () => undefined);
		const onGrokDialogCancel = vi.fn();
		const model = {
			rows: [grokRow(), { ...grokRow(), id: "claude", displayName: "Claude" }],
			error: null,
			loading: false,
			draftKeys: {},
			saving: false,
			labels: labels(),
			onToggleExpanded: () => undefined,
			onToggleEditor: () => undefined,
			onDraftKeyChange: () => undefined,
			onAdopt: async () => undefined,
			onRemove: async () => undefined,
			onRefreshModels: async () => undefined,
			onCopyApiKey: async () => undefined,
			refreshingCatalog: false,
			onRefreshCatalog: async () => undefined,
			grokLoggedIn: false,
			grokBusy: false,
			grokDialog: { open: true, userCode: "ABCD-1234", url: "https://accounts.x.ai/oauth2/device", error: null },
			onGrokLogin,
			onGrokLogout: async () => undefined,
			onGrokDialogCancel,
			onGrokOpenPage: () => undefined,
			onGrokCopyCode: () => undefined,
		} satisfies PresetProvidersSectionModel;

		render(<PresetProvidersSectionView model={model} />);
		expect(screen.getByText("ABCD-1234")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "grokSubscriptionLogin" }));
		expect(onGrokLogin).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "grokSubscriptionLogin" })).toBeTruthy();
		expect(screen.getAllByText("claude").length).toBeGreaterThan(0);
	});
});
