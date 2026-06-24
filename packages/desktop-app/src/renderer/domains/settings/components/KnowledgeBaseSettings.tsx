import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import {
	activityPanelOpenAtom,
	knowledgeBaseEnabledAtom,
	knowledgeRetrievalActiveAtom,
	remoteProvidersAtom,
	type SessionInfo,
} from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";

const POLL_INTERVALS = [3, 5, 10, 30];
/** 0 = 永不自动加工（仅停后台轮询，仍可手动整理）。 */
const NEVER_INTERVAL = 0;
const AGENT_CONCURRENCY_OPTIONS = [1, 2, 3, 4, 6, 8];

interface ModelOption {
	key: string;
	provider: string;
	displayName: string;
	remote: boolean;
}

export function KnowledgeBaseSettings(): JSX.Element {
	const navigate = useNavigate();
	const setKnowledgeBaseEnabled = useSetAtom(knowledgeBaseEnabledAtom);
	const setKnowledgeRetrievalActive = useSetAtom(knowledgeRetrievalActiveAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const [enabled, setEnabled] = useState(true);
	const [interval, setIntervalMinutes] = useState(5);
	const [agentConcurrency, setAgentConcurrency] = useState(3);
	const [modelKey, setModelKey] = useState<string>("");
	const [localModels, setLocalModels] = useState<ModelOption[]>([]);
	const [busy, setBusy] = useState<"scan" | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [probing, setProbing] = useState(false);
	const [probeResult, setProbeResult] = useState<{ ok: boolean; msg: string } | null>(null);

	// 云端模型目录(由 useAuth 在登录后流式写入)。与本地 models.json 合并,本地同 key 优先。
	const remoteProviders = useAtomValue(remoteProvidersAtom);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const kb = config.knowledgeBase;
			setEnabled(kb?.enabled !== false);
			setIntervalMinutes(kb?.pollIntervalMinutes ?? 5);
			setAgentConcurrency(kb?.agentConcurrency ?? 3);
			setModelKey(kb?.processingModelKey ?? "");
		});
		void window.vetta.models.get().then((cfg) => {
			const opts: ModelOption[] = [];
			for (const [provider, pc] of Object.entries(cfg.providers)) {
				for (const model of pc.models ?? []) {
					opts.push({
						key: `${provider}/${model.id}`,
						provider: pc.displayName || provider,
						displayName: model.name || model.id,
						remote: false,
					});
				}
			}
			setLocalModels(opts);
		});
	}, []);

	const models = useMemo<ModelOption[]>(() => {
		type ProviderShape = { displayName?: string; models?: Array<{ id: string; name?: string }> };
		const localKeys = new Set(localModels.map((m) => m.key));
		const remote: ModelOption[] = [];
		for (const [provider, pc] of Object.entries(remoteProviders as Record<string, ProviderShape>)) {
			for (const model of pc?.models ?? []) {
				if (!model.id) continue;
				const key = `${provider}/${model.id}`;
				if (localKeys.has(key)) continue;
				remote.push({
					key,
					provider: pc.displayName || provider,
					displayName: model.name || model.id,
					remote: true,
				});
			}
		}
		return [...localModels, ...remote];
	}, [localModels, remoteProviders]);

	const persist = useCallback(
		async (patch: {
			enabled?: boolean;
			pollIntervalMinutes?: number;
			processingModelKey?: string;
			agentConcurrency?: number;
		}) => {
			await window.vetta.config.set({ knowledgeBase: patch });
			await window.vetta.knowledge.reload();
		},
		[],
	);

	const handleToggle = useCallback(
		(checked: boolean) => {
			setEnabled(checked);
			setKnowledgeBaseEnabled(checked);
			if (!checked) setKnowledgeRetrievalActive(false);
			void persist({ enabled: checked });
		},
		[persist, setKnowledgeBaseEnabled, setKnowledgeRetrievalActive],
	);

	const handleInterval = useCallback(
		(value: string) => {
			const minutes = Number(value);
			setIntervalMinutes(minutes);
			void persist({ pollIntervalMinutes: minutes });
		},
		[persist],
	);

	const handleAgentConcurrency = useCallback(
		(value: string) => {
			const n = Number(value);
			setAgentConcurrency(n);
			void persist({ agentConcurrency: n });
		},
		[persist],
	);

	const handleModel = useCallback(
		(value: string) => {
			setModelKey(value);
			setProbeResult(null);
			void persist({ processingModelKey: value });
		},
		[persist],
	);

	const handleProbe = useCallback(async () => {
		const slash = modelKey.indexOf("/");
		if (slash <= 0) {
			setProbeResult({ ok: false, msg: "请先选择模型" });
			return;
		}
		setProbing(true);
		setProbeResult(null);
		try {
			const ref = { provider: modelKey.slice(0, slash), model: modelKey.slice(slash + 1) };
			const result = await window.vetta.models.probe(ref);
			setProbeResult({
				ok: result.ok,
				msg: result.ok ? (result.message ?? "可连通") : (result.error ?? "未知错误"),
			});
		} finally {
			setProbing(false);
		}
	}, [modelKey]);

	const handleScan = useCallback(async () => {
		setBusy("scan");
		setStatus(null);
		try {
			const res = await window.vetta.knowledge.scanNow();
			setStatus(res.skipped ? "文件没有变化，这次不用整理" : "已经开始整理了，整理记录里能看到进度");
		} catch (err) {
			setStatus(`没整理成功：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setBusy(null);
		}
	}, []);

	// 直接定位到最新一轮加工 session 的只读视图并展开活动面板；无记录则行内提示。
	const handleOpenRecords = useCallback(async () => {
		setStatus(null);
		const config = await window.vetta.config.get();
		const cwd = config.knowledgeProcessingCwd;
		const list = cwd ? ((await window.vetta.session.listSessions(cwd)) as SessionInfo[]) : [];
		if (list.length === 0) {
			setStatus("暂无加工记录");
			return;
		}
		setActivityPanelOpen(true);
		void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(list[0].path) } });
	}, [navigate, setActivityPanelOpen]);

	const grouped = new Map<string, ModelOption[]>();
	for (const m of models) {
		const list = grouped.get(m.provider) ?? [];
		list.push(m);
		grouped.set(m.provider, list);
	}

	const btnClass =
		"inline-flex items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50";

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">知识库设置</h1>

			<SettingSection
				section={SETTINGS_SECTION["knowledge-processing"]}
				description="把你放进知识库的资料，自动整理成方便 AI 查阅的笔记。聊天时 AI 会自动参考这些资料来回答。"
			>
				<SettingRow title="开启知识库" description="关闭后 AI 不再使用知识库，也会停止整理资料。">
					<Switch checked={enabled} onCheckedChange={handleToggle} />
				</SettingRow>
				<SettingRow title="多久整理一次" description="放进去的新资料，隔多久自动整理一次。选「永不自动整理」则只在你点「马上整理」时整理。">
					<Select value={String(interval)} onValueChange={handleInterval} disabled={!enabled}>
						<SelectTrigger className="h-7 min-w-[120px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{POLL_INTERVALS.map((m) => (
								<SelectItem key={m} value={String(m)} className="text-[12px]">
									每 {m} 分钟
								</SelectItem>
							))}
							<SelectItem value={String(NEVER_INTERVAL)} className="text-[12px]">
								永不自动整理
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow title="同时整理几批" description="文件多时同时开几个 AI 会话并行整理，越大越快但越占用模型额度。">
					<Select value={String(agentConcurrency)} onValueChange={handleAgentConcurrency} disabled={!enabled}>
						<SelectTrigger className="h-7 min-w-[120px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{AGENT_CONCURRENCY_OPTIONS.map((n) => (
								<SelectItem key={n} value={String(n)} className="text-[12px]">
									{n} 个
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow
					title="整理用哪个模型"
					description="整理资料时用的 AI 模型，不选就用默认的。"
					border={false}
				>
					<div className="flex flex-wrap items-center gap-2">
						<Select value={modelKey} onValueChange={handleModel} disabled={!enabled}>
							<SelectTrigger className="h-7 min-w-[220px] px-2 py-1 text-[12px]">
								<SelectValue placeholder="用默认模型" />
							</SelectTrigger>
							<SelectContent>
								{[...grouped.entries()].map(([provider, items]) => (
									<SelectGroup key={provider}>
										<SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
											{provider}
											{items[0]?.remote && (
												<span className="ml-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
													云端
												</span>
											)}
										</SelectLabel>
										{items.map((o) => (
											<SelectItem key={o.key} value={o.key} className="text-[12px]">
												{o.displayName}
											</SelectItem>
										))}
									</SelectGroup>
								))}
							</SelectContent>
						</Select>
						<button
							type="button"
							onClick={() => void handleProbe()}
							disabled={!enabled || probing || !modelKey}
							className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							<span>测试连通</span>
							{probing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : probeResult?.ok ? (
								<span className="icon-[mdi--check] h-3.5 w-3.5 text-green-600 dark:text-green-400" />
							) : probeResult && !probeResult.ok ? (
								<span className="icon-[mdi--close] h-3.5 w-3.5 text-red-500" />
							) : null}
						</button>
						{probeResult && !probeResult.ok && (
							<span className="text-[11px] text-red-500">{probeResult.msg}</span>
						)}
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["knowledge-actions"]} description={status ?? undefined}>
				<SettingRow title="马上整理" description="不想等，现在就把新资料整理一遍。">
					<button type="button" onClick={() => void handleScan()} disabled={!enabled || busy !== null} className={btnClass}>
						<span>马上整理</span>
						{busy === "scan" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
				<SettingRow title="整理记录" description="看看 AI 每次都整理了哪些资料。" border={false}>
					<button type="button" onClick={() => void handleOpenRecords()} className={btnClass}>
						<span>查看记录</span>
					</button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
