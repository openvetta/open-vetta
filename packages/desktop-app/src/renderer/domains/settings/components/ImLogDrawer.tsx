import { useTranslation } from "react-i18next";
import type { ImLogEvent } from "@preload/api";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { SettingHeading } from "./shared";
import { SETTINGS_SECTION } from "../registry";

export function ImLogDrawer({ logs, onClose }: { logs: ImLogEvent[]; onClose: () => void }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
			<div
				className="flex h-full w-[520px] flex-col border-l border-border bg-background shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<SettingHeading section={SETTINGS_SECTION["imbridge-logs"]} title={t("logTitle")} className="text-[14px]" />
					<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
						<span className="icon-[mdi--close] h-4 w-4" />
					</Button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[11px]">
					{logs.length === 0 ? (
						<div className="text-muted-foreground">{t("noLogs")}</div>
					) : (
						logs.map((log, idx) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: log stream can contain duplicate timestamp/message pairs
								key={`${log.time}-${idx}`}
								className={cn(
									"mb-1 flex gap-2",
									log.level === "error" && "text-destructive",
									log.level === "warn" && "text-amber-400",
								)}
							>
								<span className="shrink-0 text-muted-foreground">{formatLogTime(log.time)}</span>
								<span className="shrink-0 uppercase">{log.level}</span>
								<span className="break-all">{log.msg}</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}

function formatLogTime(iso: string): string {
	try {
		const date = new Date(iso);
		return date.toTimeString().slice(0, 8);
	} catch {
		return iso;
	}
}
