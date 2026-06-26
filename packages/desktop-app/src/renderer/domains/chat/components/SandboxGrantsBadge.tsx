import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { activeSessionAtom } from "@shared/store/atoms";
import type { RuntimeSandboxGrantInfo } from "../../../../../../runtime-core/src/index.js";

const REFRESH_INTERVAL_MS = 4000;

function formatRelative(timestamp: number, now: number): string {
	const deltaSec = Math.max(0, Math.round((now - timestamp) / 1000));
	if (deltaSec < 60) return `${deltaSec} 秒前`;
	const min = Math.floor(deltaSec / 60);
	if (min < 60) return `${min} 分钟前`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} 小时前`;
	const day = Math.floor(hr / 24);
	return `${day} 天前`;
}

function formatAbsolute(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function capabilityLabel(cap: RuntimeSandboxGrantInfo["capability"], t: TFunction<"chat">): string {
	switch (cap) {
		case "file.read":
			return t("capability.read");
		case "file.write":
			return t("capability.write");
		case "network":
			return t("capability.network");
		default:
			return cap;
	}
}

export function SandboxGrantsBadge(): JSX.Element | null {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const sessionId = activeSession?.runtimeId;
	const [grants, setGrants] = useState<RuntimeSandboxGrantInfo[]>([]);
	const [open, setOpen] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const containerRef = useRef<HTMLDivElement>(null);

	const refresh = useCallback(async () => {
		if (!sessionId) {
			setGrants([]);
			return;
		}
		try {
			const result = await window.vetta.session.listSandboxGrants(sessionId);
			setGrants(result);
		} catch {
			// Ignore — IPC may be torn down during navigation.
		}
	}, [sessionId]);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			setNow(Date.now());
			void refresh();
		}, REFRESH_INTERVAL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		if (!open) return;
		void refresh();
		const handler = (e: MouseEvent) => {
			if (!containerRef.current) return;
			if (containerRef.current.contains(e.target as Node)) return;
			setOpen(false);
		};
		window.addEventListener("mousedown", handler);
		return () => window.removeEventListener("mousedown", handler);
	}, [open, refresh]);

	const handleRevoke = useCallback(
		async (grantId: string) => {
			if (!sessionId) return;
			await window.vetta.session.revokeSandboxGrant(sessionId, grantId);
			await refresh();
		},
		[sessionId, refresh],
	);

	const handleRevokeAll = useCallback(async () => {
		if (!sessionId) return;
		await window.vetta.session.revokeAllSandboxGrants(sessionId);
		await refresh();
	}, [sessionId, refresh]);

	const sortedGrants = useMemo(() => grants.slice().sort((a, b) => b.createdAt - a.createdAt), [grants]);

	if (!sessionId || grants.length === 0) return null;

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				title={t("sandboxGrantsBadge.tooltip")}
				className={`flex h-7 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400 ${
					open ? "ring-1 ring-amber-500/40" : ""
				}`}
			>
				<span className="icon-[solar--shield-keyhole-minimalistic-linear] h-3.5 w-3.5" />
				<span>{grants.length}</span>
			</button>
			{open ? (
				<div className="absolute right-0 top-9 z-50 w-[360px] rounded-lg border border-border bg-popover p-2 shadow-lg">
					<div className="flex items-center justify-between px-1 pb-1.5">
						<div className="text-[12px] font-medium text-foreground">{t("sandboxGrantsBadge.title")}</div>
						<button
							type="button"
							onClick={handleRevokeAll}
							className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							{t("sandboxGrantsBadge.revokeAll")}
						</button>
					</div>
					<div className="max-h-[320px] space-y-1 overflow-auto">
						{sortedGrants.map((grant) => (
							<div
								key={grant.id}
								className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-muted/50"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
											{grant.toolName}·{capabilityLabel(grant.capability, t)}
										</span>
										<span title={formatAbsolute(grant.createdAt)} className="text-[10px] text-muted-foreground/70">
											{formatRelative(grant.createdAt, now)}
										</span>
									</div>
									<div className="mt-0.5 truncate font-mono text-[11px] text-foreground" title={grant.grantRoot}>
										{grant.grantRoot}
									</div>
								</div>
								<button
									type="button"
									onClick={() => void handleRevoke(grant.id)}
									className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								>
									{t("sandboxGrantsBadge.revoke")}
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
