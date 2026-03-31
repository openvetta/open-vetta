import { useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { projectsAtom, sessionsMapAtom } from "@shared/store/atoms";
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
		<div className="flex h-full w-full flex-col">
			{/* Header */}
			<div className="shrink-0 border-b border-border/50 px-8 py-6">
				<div className="flex items-start justify-between">
					<div className="min-w-0 space-y-1">
						<h1 className="text-xl font-semibold tracking-tight text-foreground">
							{displayName}
						</h1>
						<p className="truncate text-[13px] text-muted-foreground">{decodedCwd}</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void window.vetta.shell.showInFolder(decodedCwd)}
						title={isMac ? "在 Finder 中显示" : "在资源管理器中显示"}
					>
						<span className="icon-[mdi--folder-open-outline] mr-1.5 h-4 w-4" />
						{isMac ? "Finder" : "资源管理器"}
					</Button>
				</div>

				{/* Stats */}
				<div className="mt-4 flex items-center gap-6">
					<div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
						<span className="icon-[mdi--chat-outline] h-3.5 w-3.5" />
						<span>{sessionCount} 个会话</span>
					</div>
					{createdAt && (
						<div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
							<span className="icon-[mdi--calendar-outline] h-3.5 w-3.5" />
							<span>{formatDate(createdAt)}</span>
						</div>
					)}
					{project && project.type !== "normal" && (
						<div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
							<span className="icon-[mdi--tag-outline] h-3.5 w-3.5" />
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

			{/* Editor section */}
			<div className="flex min-h-0 flex-1 flex-col px-8 py-5">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="icon-[mdi--file-document-edit-outline] h-4 w-4 text-muted-foreground" />
						<h2 className="text-[13px] font-semibold text-foreground">AGENTS.md</h2>
						{isDirty && (
							<span className="h-1.5 w-1.5 rounded-full bg-primary" title="未保存的更改" />
						)}
					</div>
					<div className="flex items-center gap-2">
						{saveStatus === "saved" && (
							<span className="text-[12px] text-emerald-500 transition-opacity">已保存</span>
						)}
						{saveStatus === "error" && (
							<span className="text-[12px] text-destructive transition-opacity">保存失败</span>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => void save()}
							disabled={!isDirty || saveStatus === "saving"}
						>
							{saveStatus === "saving" ? (
								<span className="icon-[mdi--loading] mr-1.5 h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--content-save-outline] mr-1.5 h-3.5 w-3.5" />
							)}
							保存
						</Button>
					</div>
				</div>

				{loading ? (
					<div className="flex flex-1 items-center justify-center">
						<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				) : (
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="在此编写 AGENTS.md 项目指令..."
						spellCheck={false}
						className="min-h-0 flex-1 resize-none rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-ring/50 focus:outline-none"
					/>
				)}

				<p className="mt-2 text-[11px] text-muted-foreground/60">
					AGENTS.md 用于定义项目级别的 AI 指令，所有会话都会自动加载此文件。{isMac ? "Cmd" : "Ctrl"}+S 快速保存。
				</p>
			</div>
		</div>
	);
}
