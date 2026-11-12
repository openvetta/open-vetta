import type { ComponentType, ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
	__setPluginHostBridge,
	ModelPicker,
	type PluginHostBridge,
	type PluginModelPickerProps,
} from "../src/index.js";

const HostModelPicker: ComponentType<PluginModelPickerProps> = () => null;

function installBridge(bridge: Partial<PluginHostBridge>): void {
	__setPluginHostBridge(bridge as PluginHostBridge);
}

afterEach(() => {
	installBridge({});
});

describe("ModelPicker", () => {
	it("renders the host's model picker with the plugin's props untouched", () => {
		installBridge({ ModelPicker: HostModelPicker });
		const onChange = (): void => undefined;
		const props: PluginModelPickerProps = {
			value: "provider/model",
			onChange,
			emptyOption: { label: "Follow default" },
			variant: "inline",
		};

		const element = ModelPicker(props) as ReactElement<PluginModelPickerProps>;

		expect(element.type).toBe(HostModelPicker);
		expect(element.props).toEqual(props);
	});
});
