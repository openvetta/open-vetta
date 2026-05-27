import { useEffect, useRef, useState } from "react";
import "./SendButton.css";

interface SendButtonProps {
	canSend: boolean;
	isStreaming: boolean;
	onSend: () => void;
	onAbort: () => void;
}

type IconState = "send" | "to-stop" | "stop" | "to-send";

export function SendButton({ canSend, isStreaming, onSend, onAbort }: SendButtonProps): JSX.Element {
	const isActive = isStreaming || canSend;
	const wasStreamingRef = useRef(isStreaming);
	const [iconState, setIconState] = useState<IconState>(isStreaming ? "stop" : "send");
	const [showOutgoingArrow, setShowOutgoingArrow] = useState(false);

	useEffect(() => {
		if (!wasStreamingRef.current && isStreaming) {
			setShowOutgoingArrow(true);
			setIconState("to-stop");
		} else if (wasStreamingRef.current && !isStreaming) {
			setShowOutgoingArrow(false);
			setIconState("to-send");
		}
		wasStreamingRef.current = isStreaming;
	}, [isStreaming]);

	function handleStemAnimationEnd(): void {
		if (iconState === "to-stop") {
			setIconState("stop");
		} else if (iconState === "to-send") {
			setIconState("send");
		}
	}

	return (
		<button
			type="button"
			onClick={isStreaming ? onAbort : onSend}
			disabled={!isStreaming && !canSend}
			className="send-button relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-shadow disabled:cursor-not-allowed"
			data-icon-state={iconState}
			style={{
				background: isActive
					? "var(--primary)"
					: "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
				color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
				boxShadow: isActive
					? "0 6px 18px -6px color-mix(in srgb, var(--primary) 70%, transparent)"
					: "none",
			}}
			title={isStreaming ? "停止生成" : "发送消息"}
		>
			{showOutgoingArrow ? (
				<span
					aria-hidden
					className="send-button-outgoing-arrow"
					onAnimationEnd={() => setShowOutgoingArrow(false)}
				>
					<span className="send-button-outgoing-stem" />
					<span className="send-button-outgoing-side send-button-outgoing-side-left" />
					<span className="send-button-outgoing-side send-button-outgoing-side-right" />
				</span>
			) : null}

			<span
				aria-hidden
				className="send-button-icon"
			>
				<span
					className="send-button-stem"
					onAnimationEnd={handleStemAnimationEnd}
				/>
				<span className="send-button-side send-button-side-left" />
				<span className="send-button-side send-button-side-right" />
			</span>
		</button>
	);
}
