import { useCallback, useEffect, useState } from "react";
import { SettingRow, SettingSection } from "./shared";

type RuntimesStatus = Awaited<ReturnType<typeof window.vetta.runtimes.getStatus>>;
type RuntimeStatus = RuntimesStatus["node"];
type RuntimeKind = "node" | "python";

const LABELS: Record<RuntimeKind, { name: string; desc: string; icon: string }> = {
	node: {
		name: "Node.js",
		desc: "运行 JavaScript / TypeScript 工具与 npm 包",
		icon: "icon-[mdi--nodejs]",
	},
	python: {
		name: "Python",
		desc: "运行 Python 脚本与 pip 包",
		icon: "icon-[mdi--language-python]",
	},
};

function RuntimeCard({
	kind,
	status,
	busy,
	onReinstall,
}: {
	kind: RuntimeKind;
	status: RuntimeStatus;
	busy: boolean;
	onReinstall: () => void;
}): JSX.Element {
	const meta = LABELS[kind];
	const stateText = !status.supported
		? "当前平台不支持"
		: status.ready
			? `已就绪 · ${status.managedVersion}`
			: busy
				? "获取中…"
				: "未就绪";
	const stateClass = status.ready ? "text-emerald-500" : status.supported ? "text-amber-500" : "text-muted-foreground";

	return (
		<SettingRow title={meta.name} description={meta.desc} border={kind === "node"}>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<span
						className={
							status.ready
								? "icon-[mdi--check-circle] h-4 w-4 text-emerald-500"
								: "icon-[mdi--alert-circle-outline] h-4 w-4 text-amber-500"
						}
					/>
					<span className={`text-[12px] ${stateClass}`}>{stateText}</span>
				</div>
				{status.supported && (
					<button
						type="button"
						disabled={busy}
						onClick={onReinstall}
						className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						{busy ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--download-outline] h-3.5 w-3.5 text-muted-foreground" />
						)}
						{status.ready ? "重新获取" : "获取"}
					</button>
				)}
			</div>
		</SettingRow>
	);
}

export function EnvironmentSettings(): JSX.Element {
	const [status, setStatus] = useState<RuntimesStatus | null>(null);
	const [busy, setBusy] = useState<RuntimeKind | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setStatus(await window.vetta.runtimes.getStatus());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleReinstall = useCallback(
		async (kind: RuntimeKind) => {
			setBusy(kind);
			setError(null);
			try {
				await window.vetta.runtimes.reinstall(kind);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy(null);
			}
		},
		[refresh],
	);

	const handleRedetect = useCallback(async () => {
		try {
			setStatus(await window.vetta.runtimes.redetect());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">环境管理</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">
				Vetta 自带 Node.js 与 Python 运行时，无需你手动安装。运行命令时会自动切换到国内镜像源，无需配置代理。
			</p>

			{error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}

			<SettingSection title="运行时">
				{status ? (
					<>
						<RuntimeCard
							kind="node"
							status={status.node}
							busy={busy === "node"}
							onReinstall={() => void handleReinstall("node")}
						/>
						<RuntimeCard
							kind="python"
							status={status.python}
							busy={busy === "python"}
							onReinstall={() => void handleReinstall("python")}
						/>
					</>
				) : (
					<div className="px-5 py-4 text-[12px] text-muted-foreground">加载中…</div>
				)}
			</SettingSection>

			<SettingSection title="镜像源">
				<SettingRow title="npm 仓库" description="安装 npm 包时使用的镜像，自动注入" border>
					<span className="text-[12px] text-muted-foreground">{status?.mirrors.npmRegistry ?? "—"}</span>
				</SettingRow>
				<SettingRow title="pip 索引" description="安装 Python 包时使用的镜像，自动注入" border={false}>
					<span className="text-[12px] text-muted-foreground">{status?.mirrors.pipIndexUrl ?? "—"}</span>
				</SettingRow>
			</SettingSection>

			<SettingSection
				title={
					<div className="flex items-center justify-between">
						<span>系统已装运行时</span>
						<button
							type="button"
							onClick={() => void handleRedetect()}
							className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
							重新探测
						</button>
					</div>
				}
			>
				<SettingRow
					title="Node.js"
					description="Vetta 始终优先使用自带运行时，此处仅供参考"
					border
				>
					<span className="text-[12px] text-muted-foreground">
						{status?.node.system ? status.node.system.version : "未检测到"}
					</span>
				</SettingRow>
				<SettingRow title="Python" description="Vetta 始终优先使用自带运行时，此处仅供参考" border={false}>
					<span className="text-[12px] text-muted-foreground">
						{status?.python.system ? status.python.system.version : "未检测到"}
					</span>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
