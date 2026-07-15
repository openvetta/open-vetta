import { useTranslation } from "@vetta-org/plugin-sdk";
import type { JSX } from "react";

export function PowerPointCompatibility(): JSX.Element {
	const { t } = useTranslation();
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
			<span className="text-[14px] font-semibold text-[var(--foreground)]">{t("pptx.unsupported.title")}</span>
			<p className="max-w-lg text-[12px] leading-5 text-[var(--muted-foreground)]">{t("pptx.unsupported.body")}</p>
		</div>
	);
}
