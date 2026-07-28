import { useCallback, useEffect, useRef, useState } from "react";
import { useActivityTab } from "@vetta-org/plugin-sdk";
import { IconLottie, IconRefresh } from "./icons";
import { LottieStudioView } from "./LottieStudioView";
import { bumpVersion, pluginContext, useLottieStore } from "./store";

interface FileItem {
	name: string;
	path: string;
}

const subtle = "color-mix(in srgb, var(--foreground) 10%, transparent)";

function basename(path: string): string {
	const seg = path.split(/[\\/]/).pop() ?? path;
	return seg.replace(/\.lottie$/i, "");
}

export function LottieStudioPanel() {
	const { cwd } = useActivityTab();
	const { activePath, version } = useLottieStore();
	const [files, setFiles] = useState<FileItem[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [text, setText] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const reqId = useRef(0);

	const scan = useCallback(async (): Promise<void> => {
		const ctx = pluginContext();
		if (!cwd || !ctx) {
			setFiles([]);
			return;
		}
		try {
			const all = await ctx.fs.listFilesRecursive(cwd);
			const lottie = all
				.filter((f) => f.name.toLowerCase().endsWith(".lottie"))
				.map((f) => ({ name: basename(f.path), path: f.path }))
				.sort((a, b) => a.name.localeCompare(b.name));
			setFiles(lottie);
		} catch {
			setFiles([]);
		}
	}, [cwd]);

	useEffect(() => {
		void scan();
	}, [scan, version]);

	// Follow the save tool's focus, else keep current selection, else first file.
	useEffect(() => {
		if (activePath && files.some((f) => f.path === activePath)) {
			setSelected(activePath);
			return;
		}
		setSelected((prev) => {
			if (prev && files.some((f) => f.path === prev)) return prev;
			return files[0]?.path ?? null;
		});
	}, [files, activePath]);

	// Load the selected animation's text. Re-reads when `version` bumps (AI save
	// tool or manual refresh) so an in-place content change is picked up even
	// though `selected` (the path) is unchanged. Slot edits persist via onSave
	// and deliberately do NOT bump version, so they never trigger a reload.
	useEffect(() => {
		const ctx = pluginContext();
		if (!selected || !ctx) {
			setText(null);
			return;
		}
		const my = ++reqId.current;
		setLoadError(null);
		void ctx.fs
			.readFile(selected)
			.then((res) => {
				if (my !== reqId.current) return;
				setText(res.content);
			})
			.catch((err: unknown) => {
				if (my !== reqId.current) return;
				setText(null);
				setLoadError(`读取失败：${(err as Error).message}`);
			});
	}, [selected, version]);

	const onSave = useCallback(
		(updated: string) => {
			const ctx = pluginContext();
			if (!selected || !ctx) return;
			void ctx.fs.writeFile(selected, updated).catch(() => {
				/* best-effort; surfaced on next load */
			});
		},
		[selected],
	);

	if (!cwd) {
		return <Empty hint="未检测到工作目录，先打开一个对话或项目。" />;
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: subtle }}>
				<span className="text-[12px] font-semibold text-foreground/80">
					Lottie Studio{files.length > 0 ? ` · ${files.length}` : ""}
				</span>
				<button
					type="button"
					title="刷新"
					onClick={() => bumpVersion()}
					className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-foreground/55 transition-colors hover:text-foreground"
					style={{ background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}
				>
					<IconRefresh className="h-3.5 w-3.5" />
				</button>
			</div>

			{files.length === 0 ? (
				<Empty hint="本目录还没有 Lottie 动画。开启输入栏「Lottie」开关后，让 AI 生成一个试试。" />
			) : (
				<>
					<div className="lottie-studio-scroll-x flex gap-1.5 overflow-x-auto px-3 py-2.5">
						{files.map((f) => {
							const active = selected === f.path;
							return (
								<button
									key={f.path}
									type="button"
									onClick={() => setSelected(f.path)}
									className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${active ? "text-[var(--primary-foreground)]" : "text-foreground/65 hover:text-foreground"}`}
									style={{
										background: active ? "var(--primary)" : "transparent",
										borderColor: active ? "var(--primary)" : "color-mix(in srgb, var(--foreground) 14%, transparent)",
									}}
									title={f.path}
								>
									{f.name}
								</button>
							);
						})}
					</div>
					<div className="min-h-0 flex-1">
						{loadError ? (
							<Empty hint={loadError} />
						) : text !== null ? (
							<LottieStudioView key={selected ?? ""} jsonText={text} onSave={onSave} />
						) : (
							<Empty hint="加载中…" />
						)}
					</div>
				</>
			)}
		</div>
	);
}

function Empty({ hint }: { hint: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<IconLottie className="h-10 w-10" />
			<p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
				{hint}
			</p>
		</div>
	);
}
