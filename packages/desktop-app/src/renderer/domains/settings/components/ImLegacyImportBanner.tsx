import { useTranslation } from "react-i18next";
import type { ImLegacyDetection } from "@preload/api";
import { Button } from "@shared/components/ui/button";

export function ImLegacyImportBanner({
	legacy,
	importing,
	onImport,
	onSkip,
}: {
	legacy: ImLegacyDetection;
	importing: boolean;
	onImport: () => Promise<void>;
	onSkip: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-[12px] text-foreground">
			<div className="mb-2 font-medium">{t("legacyTitle")}</div>
			<div className="mb-3">
				{t("legacyPath", { path: legacy.credentialsPath ?? legacy.configPath ?? legacy.statePath })}
				{legacy.parsed?.feishu?.appId && (
					<span className="ml-2 text-primary">（App ID: {legacy.parsed.feishu.appId}）</span>
				)}
			</div>
			<div className="flex gap-2">
				<Button variant="primary" size="sm" onClick={() => void onImport()} disabled={importing || !legacy.parsed?.feishu?.appId}>
					{importing ? t("importing") : t("importToNew")}
				</Button>
				<Button variant="outline" size="sm" onClick={onSkip}>
					{t("skip")}
				</Button>
			</div>
		</div>
	);
}
