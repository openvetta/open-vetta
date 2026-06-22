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
import { useCallback, useEffect, useState } from "react";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";

const POLL_INTERVALS = [3, 5, 10, 30];

interface ModelOption {
	key: string;
	provider: string;
	displayName: string;
}

export function KnowledgeBaseSettings(): JSX.Element {
	const [enabled, setEnabled] = useState(false);
	const [interval, setIntervalMinutes] = useState(5);
	const [modelKey, setModelKey] = useState<string>("");
	const [models, setModels] = useState<ModelOption[]>([]);
	const [busy, setBusy] = useState<"scan" | "rebuild" | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const kb = config.knowledgeBase;
			setEnabled(kb?.enabled === true);
			setIntervalMinutes(kb?.pollIntervalMinutes ?? 5);
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
					});
				}
			}
			setModels(opts);
		});
	}, []);

	const persist = useCallback(
		async (patch: { enabled?: boolean; pollIntervalMinutes?: number; processingModelKey?: string }) => {
			await window.vetta.config.set({ knowledgeBase: patch });
			await window.vetta.knowledge.reload();
		},
		[],
	);

	const handleToggle = useCallback(
		(checked: boolean) => {
			setEnabled(checked);
			void persist({ enabled: checked });
		},
		[persist],
	);

	const handleInterval = useCallback(
		(value: string) => {
			const minutes = Number(value);
			setIntervalMinutes(minutes);
			void persist({ pollIntervalMinutes: minutes });
		},
		[persist],
	);

	const handleModel = useCallback(
		(value: string) => {
			setModelKey(value);
			void persist({ processingModelKey: value });
		},
		[persist],
	);

	const handleScan = useCallback(async () => {
		setBusy("scan");
		setStatus(null);
		try {
			const res = await window.vetta.knowledge.scanNow();
			setStatus(res.skipped ? "没有检测到 raws 变更" : "已触发一轮加工");
		} catch (err) {
			setStatus(`加工失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setBusy(null);
		}
	}, []);

	const handleRebuild = useCallback(async () => {
		setBusy("rebuild");
		setStatus(null);
		try {
			await window.vetta.knowledge.rebuildIndex();
			setStatus("已重建 tags.json / manifest.json");
		} catch (err) {
			setStatus(`重建失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setBusy(null);
		}
	}, []);

	const grouped = new Map<string, ModelOption[]>();
	for (const m of models) {
		const list = grouped.get(m.provider) ?? [];
		list.push(m);
		grouped.set(m.provider, list);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">知识库设置</h1>

			<SettingSection
				section={SETTINGS_SECTION["knowledge-processing"]}
				description="把 ~/.vetta/knowledges/raws/ 下的原始文件惰性加工成结构化 wiki。每轮加工是一次可在侧边栏回看的会话。"
			>
				<SettingRow title="后台自动加工" description="开启后定期检测 raws 变化并攒批加工。">
					<Switch checked={enabled} onCheckedChange={handleToggle} />
				</SettingRow>
				<SettingRow title="轮询间隔" description="多久检测一次 raws 变化。">
					<Select value={String(interval)} onValueChange={handleInterval} disabled={!enabled}>
						<SelectTrigger className="h-7 min-w-[120px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{POLL_INTERVALS.map((m) => (
								<SelectItem key={m} value={String(m)} className="text-[12px]">
									{m} 分钟
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow
					title="加工模型"
					description="后台加工会话使用的模型，缺省跟随默认模型。"
					border={false}
				>
					<Select value={modelKey} onValueChange={handleModel}>
						<SelectTrigger className="h-7 min-w-[220px] px-2 py-1 text-[12px]">
							<SelectValue placeholder="跟随默认模型" />
						</SelectTrigger>
						<SelectContent>
							{[...grouped.entries()].map(([provider, items]) => (
								<SelectGroup key={provider}>
									<SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
										{provider}
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
				</SettingRow>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["knowledge-actions"]} description={status ?? undefined}>
				<SettingRow title="立即扫描并加工" description="不等轮询周期，立刻跑一轮加工。">
					<button
						type="button"
						onClick={() => void handleScan()}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						<span>立即扫描</span>
						{busy === "scan" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
				<SettingRow
					title="重建索引"
					description="从 wiki frontmatter 重建 tags.json / manifest.json 缓存。"
					border={false}
				>
					<button
						type="button"
						onClick={() => void handleRebuild()}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						<span>重建索引</span>
						{busy === "rebuild" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
