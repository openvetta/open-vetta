import type { PluginToolCallSlotProps } from "@vetta/plugin-sdk";
import { IconLottie } from "./icons";
import { focusAnimation, pluginContext } from "./store";
import { ACTIVITY_TAB_ID } from "./constants";

interface SaveResult {
	ok?: boolean;
	path?: string;
	name?: string;
	frames?: number;
	slots?: number;
	error?: string;
}

function parseResult(raw: string | undefined): SaveResult | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as SaveResult) : null;
	} catch {
		return null;
	}
}

const subtle = "color-mix(in srgb, var(--foreground) 12%, transparent)";

/** Inline transcript UI for the `save_lottie_animation` tool result. */
export function ToolResultCard({ toolCall }: PluginToolCallSlotProps) {
	const result = parseResult(toolCall.result);
	const name = result?.name ?? (typeof toolCall.args.name === "string" ? toolCall.args.name : "动画");
	const failed = toolCall.status === "error" || toolCall.isError || result?.ok === false;
	const pending = toolCall.status === "pending";

	const open = (): void => {
		const path = result?.path;
		if (path) focusAnimation(path);
		pluginContext()?.ui.openActivityTab(ACTIVITY_TAB_ID);
	};

	return (
		<div
			className="my-1 flex items-center gap-3 rounded-xl border px-3 py-2.5"
			style={{ borderColor: subtle, background: "var(--background)" }}
		>
			<span
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
				style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" }}
			>
				<IconLottie className="h-4.5 w-4.5" />
			</span>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-[13px] font-medium text-foreground">{name}</span>
				<span className="text-[11px]" style={{ color: failed ? "var(--destructive, #ef4444)" : "var(--muted-foreground)" }}>
					{failed
						? (result?.error ?? "生成失败")
						: pending
							? "生成中…"
							: result
								? `${result.frames ?? "?"} 帧 · ${result.slots ?? 0} 个可调属性`
								: "Lottie 动画"}
				</span>
			</div>
			{!failed && !pending && (
				<button
					type="button"
					onClick={open}
					className="ml-auto shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-90"
					style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
				>
					预览
				</button>
			)}
		</div>
	);
}
