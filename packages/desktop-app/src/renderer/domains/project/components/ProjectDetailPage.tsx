import { useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { batchProjectsAtom, projectsAtom, sessionsMapAtom } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";
import { isMac } from "@shared/lib/platform";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function formatDate(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function useProjectDetail(cwd: string) {
	const projects = useAtomValue(projectsAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const batchProjects = useAtomValue(batchProjectsAtom);

	// Check if this is a batch project (may not be in projectsAtom)
	const bp = batchProjects.find((b) => b.id === cwd);
	if (bp) {
		const project = projects.find((p) => p.cwd === cwd) ?? {
			cwd,
			name: bp.name,
			sessionCount: 0,
			type: "batch" as const,
		};
		const count = bp.tasks.filter((t) => t.sessionPath).length;
		return { project, sessionCount: count };
	}

	const project = projects.find((p) => p.cwd === cwd);
	const sessions = sessionsMap.get(cwd) ?? [];
	return { project, sessionCount: sessions.length };
}

function useAgentsMd(cwd: string) {
	const [content, setContent] = useState("");
	const [original, setOriginal] = useState("");
	const [loading, setLoading] = useState(true);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

	const filePath = `${cwd}/AGENTS.md`;

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await window.vetta.fs.readFile(filePath);
			setContent(result.content);
			setOriginal(result.content);
		} catch {
			// File doesn't exist yet
			setContent("");
			setOriginal("");
		}
		setLoading(false);
	}, [filePath]);

	useEffect(() => {
		void load();
	}, [load]);

	const save = useCallback(async () => {
		setSaveStatus("saving");
		try {
			await window.vetta.fs.writeFile(filePath, content);
			setOriginal(content);
			setSaveStatus("saved");
			setTimeout(() => setSaveStatus("idle"), 2000);
		} catch {
			setSaveStatus("error");
			setTimeout(() => setSaveStatus("idle"), 3000);
		}
	}, [filePath, content]);

	const isDirty = content !== original;

	return { content, setContent, loading, save, saveStatus, isDirty };
}

function useCreatedAt(cwd: string) {
	const [createdAt, setCreatedAt] = useState<number | null>(null);

	useEffect(() => {
		void window.vetta.fs.stat(cwd).then((result) => {
			if (result) setCreatedAt(result.createdAt);
		});
	}, [cwd]);

	return createdAt;
}

export function ProjectDetailPage(): JSX.Element {
	const { cwd } = useParams({ strict: false }) as { cwd: string };
	const decodedCwd = decodeURIComponent(cwd);

	const { project, sessionCount } = useProjectDetail(decodedCwd);
	const createdAt = useCreatedAt(decodedCwd);
	const { content, setContent, loading, save, saveStatus, isDirty } = useAgentsMd(decodedCwd);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const displayName = project?.name ?? pathBasename(decodedCwd);

	// Keyboard shortcut: Cmd/Ctrl+S to save
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (isDirty) void save();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isDirty, save]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* Header */}
			<div className="shrink-0 px-8 pb-5 pt-7">
				<div className="flex items-start justify-between">
					<div className="min-w-0 space-y-2">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							{displayName}
						</h1>
						<p className="truncate text-[12px] text-muted-foreground/70 font-mono">
							{decodedCwd}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 gap-1.5 rounded-lg border-border/60 text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
						onClick={() => void window.vetta.shell.showInFolder(decodedCwd)}
						title={isMac ? "在 Finder 中显示" : "在资源管理器中显示"}
					>
						<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5" />
						{isMac ? "Finder" : "资源管理器"}
					</Button>
				</div>

				{/* Stats pills */}
				<div className="mt-4 flex items-center gap-2">
					<div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-accent">
						<span className="icon-[mdi--chat-outline] h-3 w-3 opacity-60" />
						<span>{sessionCount} 个会话</span>
					</div>
					{createdAt && (
						<div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-accent">
							<span className="icon-[mdi--calendar-outline] h-3 w-3 opacity-60" />
							<span>{formatDate(createdAt)}</span>
						</div>
					)}
					{project && project.type !== "normal" && (
						<div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-accent">
							<span className="icon-[mdi--tag-outline] h-3 w-3 opacity-60" />
							<span>
								{project.type === "schedule"
									? "自动化"
									: project.type === "flowing"
										? "流转"
										: "批量任务"}
							</span>
						</div>
					)}
				</div>
			</div>

			{/* Divider */}
			<div className="mx-8 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

			{/* Editor section */}
			<div className="flex min-h-0 flex-1 flex-col px-8 py-5">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
							<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5 text-muted-foreground" />
						</div>
						<h2 className="text-[13px] font-semibold text-foreground">AGENTS.md</h2>
						{isDirty && (
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ring" title="未保存的更改" />
						)}
					</div>
					<div className="flex items-center gap-2.5">
						{saveStatus === "saved" && (
							<span className="animate-in fade-in text-[12px] font-medium text-emerald-400/90">已保存</span>
						)}
						{saveStatus === "error" && (
							<span className="animate-in fade-in text-[12px] font-medium text-destructive">保存失败</span>
						)}
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5 rounded-lg border-border/60 transition-all duration-200 hover:border-foreground/20"
							onClick={() => void save()}
							disabled={!isDirty || saveStatus === "saving"}
						>
							{saveStatus === "saving" ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--content-save-outline] h-3.5 w-3.5" />
							)}
							保存
						</Button>
					</div>
				</div>

				{loading ? (
					<div className="flex flex-1 items-center justify-center">
						<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
					</div>
				) : (
					<div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-muted/20 transition-colors duration-300 focus-within:border-ring/40 focus-within:bg-muted/30">
						<textarea
							ref={textareaRef}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder="在此编写 AGENTS.md 项目指令..."
							spellCheck={false}
							className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
						/>
					</div>
				)}

				<p className="mt-3 text-[11px] text-muted-foreground/50">
					AGENTS.md 用于定义项目级别的 AI 指令，所有会话都会自动加载此文件。
					<kbd className="ml-1 rounded border border-border/40 bg-accent/40 px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70">
						{isMac ? "⌘" : "Ctrl"}+S
					</kbd>
					{" "}快速保存
				</p>
			</div>
		</div>
	);
}
