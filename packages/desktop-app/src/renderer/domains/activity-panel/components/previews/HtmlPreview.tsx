import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { HtmlPreviewView } from "@vetta/theme-ui/activity";
import { useTranslation } from "react-i18next";

interface HtmlPreviewProps {
	content: string;
	extension: string;
	theme: "light" | "dark";
}

export function HtmlPreview({ content, extension, theme }: HtmlPreviewProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<HtmlPreviewView
			content={content}
			extension={extension}
			theme={theme}
			labels={{
				preview: t("activityPanel.htmlPreview.preview"),
				code: t("activityPanel.htmlPreview.code"),
				title: t("activityPanel.htmlPreview.title"),
			}}
			SegmentedControl={({ items, value, onChange }) => (
				<SegmentedControl
					items={items as SegmentedControlItem<"preview" | "code">[]}
					value={value}
					onChange={onChange}
				/>
			)}
		/>
	);
}
