import { PreviewErrorBoundary as ThemePreviewErrorBoundary } from "@vetta-org/theme-ui/file-preview";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
	resetKey?: unknown;
	children: ReactNode;
	fallback?: ReactNode;
}

/** Desktop adapter: injects localized fallback copy. */
export function PreviewErrorBoundary({ resetKey, children, fallback }: Props): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<ThemePreviewErrorBoundary resetKey={resetKey} fallback={fallback} errorMessage={t("filePreview.failed")}>
			{children}
		</ThemePreviewErrorBoundary>
	);
}
