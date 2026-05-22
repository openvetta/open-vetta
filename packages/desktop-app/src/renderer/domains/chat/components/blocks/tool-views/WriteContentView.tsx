import type { ToolCallBlock } from "@shared/store/atoms";
import { getStringArg } from "./shared/parse-tool";
import { TextPreview } from "./shared/TextPreview";

export function WriteContentView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const content = getStringArg(block.args, "content");
	if (content === null) return null;
	return <TextPreview label="写入内容" text={content} />;
}
