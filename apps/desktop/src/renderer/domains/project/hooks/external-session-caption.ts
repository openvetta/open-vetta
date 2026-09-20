import type { SessionInfo } from "@shared/store/atoms";
import type { TFunction } from "i18next";

const SOURCE_KEYS: Record<
	string,
	"sourceGrok" | "sourceClaudeCode" | "sourceCodex" | "sourceCursorAgent" | "sourcePi" | "sourceOmp"
> = {
	grok: "sourceGrok",
	"claude-code": "sourceClaudeCode",
	codex: "sourceCodex",
	"cursor-agent": "sourceCursorAgent",
	pi: "sourcePi",
	omp: "sourceOmp",
};

export function externalSessionCaption(
	session: Pick<SessionInfo, "modifiedAt" | "origin" | "unavailableReason">,
	t: TFunction<"project">,
	now = Date.now(),
): string {
	const sourceKey = SOURCE_KEYS[session.origin?.tool ?? ""] ?? "sourceGrok";
	const source = t(`sidebar.external.${sourceKey}`);
	if (session.unavailableReason) {
		const reason =
			session.unavailableReason === "unsupported_version"
				? t("sidebar.external.unsupportedVersion")
				: t("sidebar.external.corruptedHeader");
		return `${reason} · ${source}`;
	}
	return `${formatSidebarRelativeTime(session.modifiedAt, t, now)} · ${source}`;
}

export function formatSidebarRelativeTime(timestamp: number, t: TFunction<"project">, now = Date.now()): string {
	const minutes = Math.floor((now - timestamp) / 60_000);
	if (minutes < 1) return t("sidebar.time.justNow");
	if (minutes < 60) return t("sidebar.time.minutes", { n: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("sidebar.time.hours", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return t("sidebar.time.days", { n: days });
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return t("sidebar.time.weeks", { n: weeks });
	const months = Math.floor(days / 30);
	if (months < 12) return t("sidebar.time.months", { n: months });
	return t("sidebar.time.years", { n: Math.floor(months / 12) });
}
