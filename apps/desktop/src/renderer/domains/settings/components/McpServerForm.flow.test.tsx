// @vitest-environment jsdom
import type { McpConfigData } from "@preload/api";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualMcpDialog } from "./ManualMcpDialog";
import { useMcpSettingsModel } from "./useMcpSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function Harness(): JSX.Element {
	const model = useMcpSettingsModel();
	return (
		<>
			<button type="button" disabled={!model.config} onClick={model.onStartAddServer}>
				Add connector
			</button>
			<ManualMcpDialog model={model} />
		</>
	);
}

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
});

describe("自定义 MCP 表单", () => {
	it("按名称填写基本字段，展开高级设置，用键盘勾选后保存真实配置", async () => {
		let config: McpConfigData = { mcpServers: {} };
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				mcp: {
					get: async () => config,
					set: async (next: McpConfigData) => {
						config = next;
					},
					authStatus: async () => ({}),
				},
			},
		});
		const user = userEvent.setup();
		render(<Harness />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Add connector" }).hasAttribute("disabled")).toBe(false),
		);
		await user.click(screen.getByRole("button", { name: "Add connector" }));
		for (const name of ["serverName", "command", "arguments"]) {
			await user.click(screen.getByText(new RegExp(`^${name}( \\*)?$`), { selector: "label" }));
			expect(document.activeElement).toBe(screen.getByRole("textbox", { name }));
		}
		await user.type(screen.getByRole("textbox", { name: "serverName" }), "local-tools");
		await user.type(screen.getByRole("textbox", { name: "command" }), "node");
		await user.type(screen.getByRole("textbox", { name: "arguments" }), "tools.js");
		await user.click(screen.getByRole("button", { name: "advancedOptions", expanded: false }));
		expect(screen.getByRole("button", { name: "advancedOptions", expanded: true })).toBeTruthy();
		for (const name of ["envVariables", "workDirectory", "startupTimeout", "autoApproveTools"]) {
			await user.click(screen.getByText(name, { selector: "label" }));
			expect(document.activeElement).toBe(screen.getByRole("textbox", { name }));
		}
		const transport = screen.getByRole("group", { name: "transportType" });
		await user.click(within(transport).getByRole("button", { name: "HTTP" }));
		for (const name of ["sseUrl", "requestHeaders"]) {
			await user.click(screen.getByText(new RegExp(`^${name}( \\*)?$`), { selector: "label" }));
			expect(document.activeElement).toBe(screen.getByRole("textbox", { name }));
		}
		await user.click(within(transport).getByRole("button", { name: "stdio" }));
		await user.type(screen.getByRole("textbox", { name: "envVariables" }), "NODE_ENV=test");
		await user.type(screen.getByRole("textbox", { name: "workDirectory" }), "/tmp/tools");
		const debug = screen.getByRole("checkbox", { name: "debugMode", checked: false });
		debug.focus();
		await user.keyboard(" ");
		expect(screen.getByRole("checkbox", { name: "debugMode", checked: true })).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "addServer" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(config.mcpServers["local-tools"]).toMatchObject({
			command: "node",
			args: ["tools.js"],
			env: { NODE_ENV: "test" },
			cwd: "/tmp/tools",
			debug: true,
		});
	});
});
