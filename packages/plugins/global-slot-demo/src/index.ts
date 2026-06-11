import React, { useMemo, useState } from "vetta-host://react";
import { definePlugin } from "vetta-host://plugin-sdk";
import "./style.css";

function DemoGlobalSlot(): React.ReactElement {
	const [open, setOpen] = useState(true);
	const [count, setCount] = useState(0);
	const timestamp = useMemo(() => new Date().toLocaleTimeString(), []);

	if (!open) {
		return React.createElement(
			"button",
			{
				type: "button",
				className: "vetta-plugin-global-slot-demo-trigger",
				onClick: () => setOpen(true),
			},
			"Plugin Demo",
		);
	}

	return React.createElement(
		"section",
		{
			className: "vetta-plugin-global-slot-demo",
			"aria-label": "Global slot demo plugin",
		},
		React.createElement(
			"div",
			{ className: "vetta-plugin-global-slot-demo-header" },
			React.createElement("div", null, [
				React.createElement("p", { key: "eyebrow", className: "vetta-plugin-global-slot-demo-eyebrow" }, "Plugin"),
				React.createElement("h2", { key: "title" }, "Global Slot Demo"),
			]),
			React.createElement(
				"button",
				{
					type: "button",
					className: "vetta-plugin-global-slot-demo-icon-button",
					onClick: () => setOpen(false),
					"aria-label": "Hide plugin demo",
				},
				"x",
			),
		),
		React.createElement(
			"p",
			{ className: "vetta-plugin-global-slot-demo-body" },
			`Rendered by an external plugin at ${timestamp}. It uses the host React singleton and Vetta theme tokens.`,
		),
		React.createElement(
			"div",
			{ className: "vetta-plugin-global-slot-demo-footer" },
			React.createElement("span", { className: "vetta-plugin-global-slot-demo-badge" }, `Clicks: ${count}`),
			React.createElement(
				"button",
				{
					type: "button",
					className: "vetta-plugin-global-slot-demo-button",
					onClick: () => setCount((value: number) => value + 1),
				},
				"Increment",
			),
		),
	);
}

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerGlobalSlot({
			id: "demo-panel",
			component: DemoGlobalSlot,
		});
	},
});
