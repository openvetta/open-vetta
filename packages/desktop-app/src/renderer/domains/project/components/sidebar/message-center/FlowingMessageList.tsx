import { Button } from "@shared/components/ui/button";
import { FlowingMessageListView } from "@vetta/theme-ui/sidebar";
import { useFlowingMessageListModel } from "./useFlowingMessageListModel";

export function FlowingMessageList(): JSX.Element {
	const model = useFlowingMessageListModel();
	return (
		<FlowingMessageListView
			{...model}
			renderAction={({ variant, disabled, label, onClick }) => (
				<Button
					size="sm"
					variant={variant === "outline" ? "outline" : "default"}
					className="h-7 rounded-lg px-3.5 text-[11px] font-medium"
					onClick={onClick}
					disabled={disabled}
				>
					{label}
				</Button>
			)}
		/>
	);
}
