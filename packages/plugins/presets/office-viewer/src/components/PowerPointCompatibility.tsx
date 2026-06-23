import type { JSX } from "react";

export function PowerPointCompatibility(): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
			<span className="text-[14px] font-semibold text-[var(--foreground)]">暂不提供 PowerPoint 内嵌渲染</span>
			<p className="max-w-lg text-[12px] leading-5 text-[var(--muted-foreground)]">
				目前没有符合长期维护要求的轻量纯本地 PPT/PPTX 渲染引擎。为避免错误版式和高风险依赖，此格式暂不做近似渲染。
			</p>
		</div>
	);
}
