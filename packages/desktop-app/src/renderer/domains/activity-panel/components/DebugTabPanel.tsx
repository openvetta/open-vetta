import { useAtom } from "jotai";
import { debugSubTabAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { ToolCallsSubTab } from "./ToolCallsSubTab";
import { RequestHistorySubTab } from "./RequestHistorySubTab";

function SubTabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
				active
					? "bg-secondary text-foreground"
					: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

export function DebugTabPanel({ cwd }: { cwd: string }): JSX.Element {
	const [subTab, setSubTab] = useAtom(debugSubTabAtom);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
				<SubTabButton active={subTab === "tool-calls"} onClick={() => setSubTab("tool-calls")}>
					工具调用
				</SubTabButton>
				<SubTabButton active={subTab === "request-history"} onClick={() => setSubTab("request-history")}>
					请求历史
				</SubTabButton>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{subTab === "tool-calls" && <ToolCallsSubTab cwd={cwd} />}
				{subTab === "request-history" && <RequestHistorySubTab cwd={cwd} />}
			</div>
		</div>
	);
}
