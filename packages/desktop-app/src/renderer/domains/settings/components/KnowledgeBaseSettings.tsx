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
import { knowledgeBaseEnabledAtom, knowledgeRetrievalActiveAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
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
	const navigate = useNavigate();
	const setKnowledgeBaseEnabled = useSetAtom(knowledgeBaseEnabledAtom);
	const setKnowledgeRetrievalActive = useSetAtom(knowledgeRetrievalActiveAtom);
	const [enabled, setEnabled] = useState(true);
	const [interval, setIntervalMinutes] = useState(5);
	const [modelKey, setModelKey] = useState<string>("");
	const [models, setModels] = useState<ModelOption[]>([]);
	const [busy, setBusy] = useState<"scan" | "rebuild" | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const kb = config.knowledgeBase;
			setEnabled(kb?.enabled !== false);
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
			setStatus(res.skipped ? "文件没有变化，这次不用整理" : "已经开始整理了，整理记录里能看到进度");
		} catch (err) {
			setStatus(`没整理成功：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setBusy(null);
		}
	}, []);

	const handleRebuild = useCallback(async () => {
		setBusy("rebuild");
		setStatus(null);
		try {
			await window.vetta.knowledge.rebuildIndex();
			setStatus("目录已经重新整理好了");
		} catch (err) {
			setStatus(`整理目录没成功：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setBusy(null);
		}
	}, []);

	const handleOpenRecords = useCallback(() => {
		void navigate({ to: "/knowledge-records" });
	}, [navigate]);

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
				<SettingRow title="多久整理一次" description="放进去的新资料，隔多久自动整理一次。">
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
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow
					title="整理用哪个模型"
					description="整理资料时用的 AI 模型，不选就用默认的。"
					border={false}
				>
					<Select value={modelKey} onValueChange={handleModel} disabled={!enabled}>
						<SelectTrigger className="h-7 min-w-[220px] px-2 py-1 text-[12px]">
							<SelectValue placeholder="用默认模型" />
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
				<SettingRow title="马上整理" description="不想等，现在就把新资料整理一遍。">
					<button type="button" onClick={() => void handleScan()} disabled={!enabled || busy !== null} className={btnClass}>
						<span>马上整理</span>
						{busy === "scan" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
				<SettingRow title="整理记录" description="看看 AI 每次都整理了哪些资料。">
					<button type="button" onClick={handleOpenRecords} className={btnClass}>
						<span>查看记录</span>
					</button>
				</SettingRow>
				<SettingRow title="重建目录" description="知识库目录乱了或对不上时，点这里重新生成。" border={false}>
					<button
						type="button"
						onClick={() => void handleRebuild()}
						disabled={!enabled || busy !== null}
						className={btnClass}
					>
						<span>重建目录</span>
						{busy === "rebuild" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
