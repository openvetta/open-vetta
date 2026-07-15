import { useTranslation } from "@vetta-org/plugin-sdk";
import { useState } from "react";
import { GitIcon } from "./icons";

/** Shown when the panel's cwd is not a Git repository. */
export function InitRepoCta({ onInit }: { onInit: () => Promise<void> }): JSX.Element {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleInit = (): void => {
		setBusy(true);
		setError(null);
		onInit()
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
			.finally(() => setBusy(false));
	};

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
				<GitIcon className="h-6 w-6" />
			</div>
			<div className="space-y-1">
				<p className="text-[14px] font-semibold text-foreground">{t("init.title")}</p>
				<p className="text-[12px] text-muted-foreground">{t("init.subtitle")}</p>
			</div>
			<button
				type="button"
				disabled={busy}
				onClick={handleInit}
				className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
			>
				<GitIcon className="h-4 w-4" />
				{busy ? t("init.busy") : t("init.cta")}
			</button>
			{error && <p className="text-[12px] text-rose-500">{error}</p>}
		</div>
	);
}
