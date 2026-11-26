// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PresetProviderRow } from "./PresetProviderRow";
import type { PresetProviderRow as PresetProviderRowModel, PresetProvidersSectionLabels } from "./usePresetProvidersSectionModel";

const labels: PresetProvidersSectionLabels = {
	title: "Preset providers",
	loading: "Loading",
	noPresetProviders: "No providers",
	enabled: "Enabled",
	deprecated: "Deprecated",
	collapseModels: "Collapse models",
	viewModels: "View models",
	modelsCount: (count) => `${count} models`,
	collapse: "Collapse",
	cancel: "Cancel",
	changeKey: "Change key",
	remove: "Remove",
	enable: "Enable",
	apiKeyDirect: (provider) => `${provider} API key`,
	apiKeyLabel: "API Key",
	apiKeyPlaceholder: "API key",
	encryptedApiKeyPlaceholder: "Saved API key",
	save: "Save",
	noModels: "No models",
	noMatchingModels: "No matching models",
	searchModels: (provider) => `Search ${provider} models`,
	clearModelSearch: "Clear model search",
	modelListLabel: (provider) => `${provider} model list`,
	thinking: "Thinking",
	perMillionTokens: "/M tokens",
	refreshModels: "Refresh models",
	refreshingModels: "Refreshing models",
	refreshCatalog: "Refresh catalog",
	copyApiKey: "Copy API key",
	testConnect: "Test",
	testing: "Testing",
	testOk: "OK",
	testFailed: "Failed",
	editBaseUrl: "Change server address",
	baseUrlPlaceholder: "Server address",
	toggleProvider: (provider) => `Toggle ${provider}`,
	managedConnected: "Managed by Magpie",
	managedNotConnected: "Not connected · switch Vetta on in Magpie",
};

function magpieRow(adopted: boolean): PresetProviderRowModel {
	const models = adopted ? [{ id: "codex/gpt-6.1-sol" }, { id: "auto/mimo" }] : [];
	return {
		id: "magpie",
		displayName: "Magpie",
		api: "openai-completions",
		icon: "magpie",
		managedBy: "magpie",
		models,
		modelRows: models.map((model) => ({ id: model.id, name: model.id, hasVision: false, hasReasoning: false, price: null })),
		offline: false,
		adopted,
		enabled: adopted,
		autoKey: false,
		isOpen: false,
		isExpanded: false,
		refreshing: false,
		hasApiKey: adopted,
		modelsError: null,
	};
}

function renderRow(row: PresetProviderRowModel) {
	const noop = vi.fn(async () => {});
	return render(
		<PresetProviderRow
			row={row}
			draftKey=""
			saving={false}
			labels={labels}
			onToggleExpanded={vi.fn()}
			onToggleEditor={vi.fn()}
			onDraftKeyChange={vi.fn()}
			onAdopt={noop}
			onToggleEnabled={noop}
			onChangeBaseUrl={vi.fn(async () => true)}
			onRemove={noop}
			onRefreshModels={noop}
			onCopyApiKey={noop}
		/>,
	);
}

// 未开 globals,testing-library 的自动清理不会注册。
afterEach(cleanup);

describe("由 Magpie 管理的预设服务商行", () => {
	it("没接入时提示去 Magpie 里打开,不给开关、密钥或删除", () => {
		renderRow(magpieRow(false));
		expect(screen.getByText(labels.managedNotConnected)).toBeTruthy();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByLabelText(labels.enable)).toBeNull();
		expect(screen.queryByLabelText(labels.remove)).toBeNull();
	});

	it("接入后展示 Magpie 写进来的模型数,仍然没有任何操作", () => {
		renderRow(magpieRow(true));
		expect(screen.getByText(`${labels.modelsCount(2)} · ${labels.managedConnected}`)).toBeTruthy();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByTitle(labels.refreshModels)).toBeNull();
		expect(screen.queryByLabelText(labels.remove)).toBeNull();
	});
});
