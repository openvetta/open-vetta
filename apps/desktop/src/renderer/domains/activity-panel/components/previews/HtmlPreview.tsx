import { HtmlPreviewView } from "@vetta-org/theme-ui/activity";
import { useTranslation } from "react-i18next";

interface HtmlPreviewProps {
	content: string;
	theme: "light" | "dark";
}

/** Host wrapper: pure HTML render surface (no nested preview/code chrome). */
export function HtmlPreview({ content, theme }: HtmlPreviewProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<div className="flex h-full min-h-0 flex-col">
			<p className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
				{t("htmlAnswer.safety")}
			</p>
			<HtmlPreviewView content={content} theme={theme} title={t("activityPanel.htmlPreview.title")} />
		</div>
	);
}
