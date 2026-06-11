import { useMemo, useState } from "react";
import { definePlugin } from "@vetta/plugin-sdk";
import "./style.css";

function DemoGlobalSlot() {
	const [open, setOpen] = useState(true);
	const [count, setCount] = useState(0);
	const timestamp = useMemo(() => new Date().toLocaleTimeString(), []);

	if (!open) {
		return (
			<button
				type="button"
				className="vetta-plugin-global-slot-demo-trigger"
				onClick={() => setOpen(true)}
			>
				Plugin Demo
			</button>
		);
	}

	return (
		<section className="vetta-plugin-global-slot-demo" aria-label="Global slot demo plugin">
			<div className="vetta-plugin-global-slot-demo-header">
				<div>
					<p className="vetta-plugin-global-slot-demo-eyebrow">Plugin</p>
					<h2>Global Slot Demo</h2>
				</div>
				<button
					type="button"
					className="vetta-plugin-global-slot-demo-icon-button"
					onClick={() => setOpen(false)}
					aria-label="Hide plugin demo"
				>
					x
				</button>
			</div>
			<p className="vetta-plugin-global-slot-demo-body">
				Rendered by an external plugin at {timestamp}. It uses the host React singleton and Vetta theme tokens.
			</p>
			<div className="vetta-plugin-global-slot-demo-footer">
				<span className="vetta-plugin-global-slot-demo-badge">Clicks: {count}</span>
				<button
					type="button"
					className="vetta-plugin-global-slot-demo-button"
					onClick={() => setCount((value) => value + 1)}
				>
					Increment
				</button>
			</div>
		</section>
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
