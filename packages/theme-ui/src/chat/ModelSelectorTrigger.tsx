import { cn } from "@vetta-org/ui/utils";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";
import { ProviderIcon } from "../shared/provider-icon";

/**
 * 触发器的形态。
 * - `inline`：输入栏里的无边框小胶囊，随输入栏容器宽度截断模型名。
 * - `field`：表单里的选择框（设置页、弹窗、插件表单），带边框，推理档位常显。
 */
export type ModelSelectorTriggerVariant = "inline" | "field";

interface ModelSelectorTriggerProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
	readonly label: string;
	readonly icon?: string;
	readonly reasoningLabel?: string;
	readonly variant?: ModelSelectorTriggerVariant;
}

const VARIANT_CLASS: Record<ModelSelectorTriggerVariant, string> = {
	// The input bar is a CSS container: truncate the name before wrapping its toolbar.
	inline:
		"max-w-[5.5rem] gap-1 rounded-full border border-transparent px-1.5 py-0.5 text-[11px] text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground @[22rem]:max-w-[9rem] @[28rem]:max-w-[13rem]",
	field:
		"max-w-full gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-foreground hover:border-border/60 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary/30 data-[state=open]:bg-primary/10 data-[state=open]:text-primary",
};

const REASONING_CLASS: Record<ModelSelectorTriggerVariant, string> = {
	inline:
		"hidden shrink-0 rounded bg-muted/70 px-1 text-[9px] leading-[14px] text-muted-foreground @[28rem]:inline",
	field: "shrink-0 text-muted-foreground",
};

/** 模型选择器的触发按钮；输入栏与表单共用，形态由 `variant` 决定。 */
export const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
	function ModelSelectorTrigger(
		{ label, icon, reasoningLabel, variant = "inline", className, title, ...props },
		ref,
	) {
		return (
			<button
				ref={ref}
				type="button"
				title={title ?? label}
				className={cn(
					"flex min-w-0 items-center transition-colors focus:outline-none focus-visible:outline-none",
					VARIANT_CLASS[variant],
					className,
				)}
				{...props}
			>
				<ProviderIcon symbol={icon} className={variant === "field" ? "h-3.5 w-3.5 shrink-0" : "h-3 w-3 shrink-0"} />
				<span className="min-w-0 flex-1 truncate text-left">{label}</span>
				{reasoningLabel ? <span className={REASONING_CLASS[variant]}>{reasoningLabel}</span> : null}
				<span
					aria-hidden="true"
					className={cn("icon-[solar--alt-arrow-down-linear] shrink-0", variant === "field" ? "h-3 w-3" : "h-2.5 w-2.5")}
				/>
			</button>
		);
	},
);
