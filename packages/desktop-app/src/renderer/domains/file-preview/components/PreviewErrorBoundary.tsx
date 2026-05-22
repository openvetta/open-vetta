import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	/** 当 resetKey 变化时，自动复位错误状态，让新的 children 有机会重新渲染。 */
	resetKey?: unknown;
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	error: Error | null;
}

/**
 * 局部错误边界：把预览子组件 render/commit 阶段的异常挡在预览区里，
 * 避免冒泡到 TanStack Router 的 defaultErrorComponent 导致整页变成 "Something went wrong!"。
 */
export class PreviewErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidUpdate(prevProps: Props): void {
		if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
			this.setState({ error: null });
		}
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[PreviewErrorBoundary]", error, info.componentStack);
	}

	render(): ReactNode {
		if (this.state.error) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
					<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
					<span className="text-[13px]">预览失败，文件可能已损坏或格式不受支持</span>
				</div>
			);
		}
		return this.props.children;
	}
}
