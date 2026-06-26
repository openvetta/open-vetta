import type { ToolCallBlock } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import { getStringArg } from "./shared/parse-tool";
import { TextPreview } from "./shared/TextPreview";

export function WriteContentView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const content = getStringArg(block.args, "content");
	if (content === null) return null;
	return <TextPreview label={t("writeContent.label")} text={content} />;
}
