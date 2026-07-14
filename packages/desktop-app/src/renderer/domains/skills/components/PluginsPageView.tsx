import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@vetta/ui";
import type { PluginsPageModel } from "../hooks/usePluginsPageModel";
import { PluginsPanel } from "./PluginsPanel";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function PluginsPageView({ model }: { model: PluginsPageModel }): JSX.Element {
	const { t } = useTranslation("skills");
	const { pluginsPanelRef } = model;

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							{t("tabs.plugin")}
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">{t("subtitlePlugin")}</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
						className="flex min-h-8 shrink-0 items-center gap-2"
					>
						<Button
							type="button"
							variant="outline"
							onClick={() => pluginsPanelRef.current?.triggerImport()}
						>
							<span className="icon-[mdi--tray-arrow-up] h-3.5 w-3.5" />
							<span>{t("actions.importPlugin")}</span>
						</Button>
					</motion.div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pt-5 pb-8">
				<PluginsPanel ref={pluginsPanelRef} />
			</div>
		</div>
	);
}
