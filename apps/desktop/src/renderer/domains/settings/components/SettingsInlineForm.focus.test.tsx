// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputField, PresetProviderRowView } from "@vetta-org/theme-ui/settings";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SshHostsSettings } from "./SshHostsSettings";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
});

describe("主动展开的行内设置表单", () => {
	it("公开输入字段保留调用方指定的原生初始聚焦，并转交 ref 与输入事件", async () => {
		const inputRef = createRef<HTMLInputElement>();
		function Harness(): JSX.Element {
			const [value, setValue] = useState("");
			return <InputField ref={inputRef} autoFocus aria-label="Custom field" value={value} onChange={setValue} />;
		}
		const user = userEvent.setup();
		render(<Harness />);
		const input = screen.getByRole("textbox", { name: "Custom field" });
		expect(inputRef.current).toBe(input);
		expect(document.activeElement).toBe(input);
		await user.keyboard("Example");
		expect(inputRef.current?.value).toBe("Example");
	});

	it("新增 SSH 主机时聚焦目标，可见标签可聚焦对应字段，输入后不抢回焦点", async () => {
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				ssh: {
					listHosts: async () => [],
					onHostsChanged: () => () => {},
					onHostStatusChanged: () => () => {},
				},
			},
		});
		const user = userEvent.setup();
		render(<SshHostsSettings />);
		await user.click(await screen.findByRole("button", { name: "sshAddHost" }));
		expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "sshFieldTarget" }));
		for (const name of ["sshFieldTarget", "sshFieldLabel", "sshFieldPort", "sshFieldIdentityFile"]) {
			await user.click(screen.getByText(name));
			expect(document.activeElement).toBe(screen.getByRole("textbox", { name }));
		}
		await user.click(screen.getByText("sshFieldLabel"));
		await user.keyboard("Build machine");
		expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "sshFieldLabel" }));
	});

	it("展开内置模型编辑器时聚焦输入，取消后再次展开仍可直接输入", async () => {
		function Harness(): JSX.Element {
			const [open, setOpen] = useState(false);
			const [draft, setDraft] = useState("");
			return (
				<PresetProviderRowView
					row={{
						displayName: "Example",
						isExpanded: false,
						isOpen: open,
						adopted: false,
						offline: false,
						models: [],
						refreshing: false,
						hasApiKey: false,
						modelsError: null,
					}}
					draftKey={draft}
					saving={false}
					onToggleExpanded={() => {}}
					onToggleEditor={() => setOpen((value) => !value)}
					onDraftKeyChange={setDraft}
					onAdopt={() => {}}
					onRemove={() => {}}
					onRefreshModels={() => {}}
					onCopyApiKey={() => {}}
					icon={null}
					labels={{
						collapseModels: "Collapse models",
						viewModels: "View models",
						enabled: "Enabled",
						deprecated: "Deprecated",
						modelsCount: (count) => `${count} models`,
						collapse: "Collapse",
						cancel: "Cancel",
						changeKey: "Change key",
						remove: "Remove",
						enable: "Enable",
						apiKeyDirect: (name) => `${name} API key`,
						apiKeyPlaceholder: "API key",
						encryptedApiKeyPlaceholder: "Replace key",
						save: "Save",
						refreshModels: "Refresh",
						refreshingModels: "Refreshing",
						copyApiKey: "Copy key",
					}}
				/>
			);
		}
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(screen.getByRole("button", { name: "Enable" }));
		const input = await screen.findByLabelText("Example API key");
		await waitFor(() => expect(document.activeElement).toBe(input));
		await user.keyboard("test-draft{Escape}");
		await waitFor(() => expect(screen.queryByLabelText("Example API key")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Enable" }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Example API key")));
		expect((screen.getByLabelText("Example API key") as HTMLInputElement).value).toBe("test-draft");
	});
});
