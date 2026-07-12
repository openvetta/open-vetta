import type { ToolCallBlock } from "@shared/store/atoms";
import { ToolCallBlockView } from "@vetta/theme-ui/chat";
import { useToolCallBlockModel } from "../../hooks/useToolCallBlockModel";

interface ToolCallBlockProps {
	block: ToolCallBlock;
	exportMode?: boolean;
}

export function ToolCallBlockViewHost({ block, exportMode = false }: ToolCallBlockProps): JSX.Element {
	const model = useToolCallBlockModel(block, exportMode);
	return <ToolCallBlockView {...model} />;
}

export { ToolCallBlockViewHost as ToolCallBlockView };
