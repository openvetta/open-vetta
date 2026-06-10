import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "./ui/button";

export function RouteErrorPage({ error, reset }: ErrorComponentProps): JSX.Element {
	const message = error instanceof Error ? error.message : String(error);

	useEffect(() => {
		console.error("[router error]", error);
	}, [error]);

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
			<div className="pointer-events-none fixed left-1/2 top-4 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2">
				<div className="pointer-events-auto flex items-start gap-3 rounded-lg border border-destructive/25 bg-background/95 px-4 py-3 text-[13px] shadow-lg backdrop-blur">
					<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground">当前页面遇到问题</p>
						<p className="mt-1 break-words text-[12px] leading-5 text-muted-foreground">{message}</p>
					</div>
					<Button type="button" variant="ghost" size="xs" onClick={reset}>
						重试
					</Button>
				</div>
			</div>

			<div className="flex flex-1 items-center justify-center px-6 py-10">
				<div className="flex w-full max-w-[420px] flex-col items-center text-center">
					<div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<span className="icon-[mdi--page-next-outline] text-[24px]" aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-[16px] font-semibold text-foreground">页面内容没有正常加载</h1>
					<p className="mt-2 text-[13px] leading-6 text-muted-foreground">
						这通常是临时状态。你可以重试当前页面，或先回到首页继续其他操作。
					</p>

					<div className="mt-5 flex flex-wrap items-center justify-center gap-2">
						<Button type="button" variant="primary" onClick={reset}>
							重试当前页面
						</Button>
						<Button type="button" variant="outline" asChild>
							<Link to="/">返回首页</Link>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
