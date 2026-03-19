import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FsEntry } from "../../../preload/fs-types";

export interface SelectedFile {
	path: string;
	name: string;
	isDirectory: boolean;
}

interface AtPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (file: SelectedFile) => void;
	filter: string;
	cwd: string;
}

/** Icon class for a given file name. */
function fileIcon(name: string, isDir: boolean): string {
	if (isDir) return "icon-[mdi--folder-outline]";
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	switch (ext) {
		case "ts":
		case "tsx":
			return "icon-[mdi--language-typescript]";
		case "js":
		case "jsx":
			return "icon-[mdi--language-javascript]";
		case "json":
			return "icon-[mdi--code-json]";
		case "md":
		case "mdx":
			return "icon-[mdi--language-markdown]";
		case "css":
		case "scss":
			return "icon-[mdi--language-css3]";
		case "html":
			return "icon-[mdi--language-html5]";
		case "py":
			return "icon-[mdi--language-python]";
		case "rs":
			return "icon-[mdi--language-rust]";
		case "go":
			return "icon-[mdi--language-go]";
		case "yaml":
		case "yml":
			return "icon-[mdi--file-cog-outline]";
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "svg":
		case "webp":
			return "icon-[mdi--file-image-outline]";
		case "pdf":
			return "icon-[mdi--file-pdf-box]";
		case "docx":
		case "doc":
			return "icon-[mdi--file-word-outline]";
		default:
			return "icon-[mdi--file-outline]";
	}
}

/** Hidden entries to never show. */
const HIDDEN = new Set(["node_modules", ".git", ".DS_Store", "Thumbs.db"]);

export function AtPanel({ open, onClose, onSelect, filter, cwd }: AtPanelProps): JSX.Element {
	const [currentDir, setCurrentDir] = useState(cwd);
	const [entries, setEntries] = useState<FsEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);

	// Reset to cwd when panel opens
	useEffect(() => {
		if (open) {
			setCurrentDir(cwd);
		}
	}, [open, cwd]);

	// Load directory contents
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		void window.vetta.fs.readDir(currentDir).then((result) => {
			if (cancelled) return;
			// Sort: directories first, then by name
			const visible = result.filter((e) => !HIDDEN.has(e.name) && !e.name.startsWith("."));
			visible.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			setEntries(visible);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [open, currentDir]);

	// Filter by text after "@"
	const normalizedFilter = filter.startsWith("@") ? filter.slice(1) : filter;
	const filtered = normalizedFilter
		? entries.filter((e) => e.name.toLowerCase().includes(normalizedFilter.toLowerCase()))
		: entries;

	// "Go up" item when not at cwd root
	const canGoUp = currentDir !== cwd;
	const allItems = filtered;

	// Reset index on filter/dir change
	useEffect(() => {
		setActiveIndex(0);
	}, [filter, currentDir]);

	// Keyboard navigation
	const totalCount = (canGoUp ? 1 : 0) + allItems.length;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!open || totalCount === 0) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i + 1) % totalCount);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i - 1 + totalCount) % totalCount);
			} else if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				if (canGoUp && activeIndex === 0) {
					const parent = currentDir.replace(/\/[^/]+\/?$/, "") || "/";
					setCurrentDir(parent);
				} else {
					const item = allItems[canGoUp ? activeIndex - 1 : activeIndex];
					if (item) {
						if (item.isDirectory) {
							setCurrentDir(item.path);
						} else {
							onSelect({ path: item.path, name: item.name, isDirectory: false });
						}
					}
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			} else if (e.key === "Tab" && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const item = allItems[canGoUp ? activeIndex - 1 : activeIndex];
				if (item?.isDirectory) {
					setCurrentDir(item.path);
				}
			}
		},
		[open, totalCount, canGoUp, activeIndex, allItems, currentDir, onSelect, onClose],
	);

	useEffect(() => {
		if (open) {
			document.addEventListener("keydown", handleKeyDown, true);
			return () => document.removeEventListener("keydown", handleKeyDown, true);
		}
	}, [open, handleKeyDown]);

	// Click outside to close
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClick);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClick);
		};
	}, [open, onClose]);

	// Scroll active item into view
	useEffect(() => {
		if (!open) return;
		const el = panelRef.current?.querySelector(`[data-index="${activeIndex}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);

	// Relative path display for breadcrumb
	const relDir = currentDir.startsWith(cwd) ? currentDir.slice(cwd.length) || "/" : currentDir;

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					ref={panelRef}
					initial={{ opacity: 0, y: 8, scaleY: 0.96 }}
					animate={{ opacity: 1, y: 0, scaleY: 1 }}
					exit={{ opacity: 0, y: 8, scaleY: 0.96 }}
					transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
					className="absolute inset-x-0 bottom-full mb-1.5 z-50 origin-bottom overflow-hidden rounded-2xl"
					style={{
						background: "var(--input-card-bg)",
						border: "1px solid var(--input-card-border)",
						boxShadow: "var(--input-card-shadow-focus)",
						maxHeight: 320,
					}}
				>
					{/* Header */}
					<div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
						<span className="icon-[mdi--at] h-4 w-4 text-[var(--text-3)]" />
						<span className="text-[12px] font-medium text-[var(--text-3)]">
							引用文件
						</span>
						<span className="ml-auto font-mono text-[11px] text-[var(--text-3)]">
							{relDir}
						</span>
					</div>

					{/* Content */}
					<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
						{loading ? (
							<div className="flex items-center justify-center py-8 text-[12px] text-[var(--text-3)]">
								加载中...
							</div>
						) : allItems.length === 0 && !canGoUp ? (
							<div className="flex items-center justify-center py-8 text-[12px] text-[var(--text-3)]">
								{normalizedFilter ? "未找到匹配项" : "空目录"}
							</div>
						) : (
							<div className="py-1">
								{/* Go up entry */}
								{canGoUp && (
									<button
										type="button"
										data-index={0}
										onMouseEnter={() => setActiveIndex(0)}
										onClick={() => {
											const parent = currentDir.replace(/\/[^/]+\/?$/, "") || "/";
											setCurrentDir(parent);
										}}
										className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors"
										style={{ background: activeIndex === 0 ? "var(--hover)" : "transparent" }}
									>
										<span className="icon-[mdi--arrow-up-left] h-4 w-4 text-[var(--text-3)]" />
										<span className="text-[12px] text-[var(--text-3)]">..</span>
									</button>
								)}

								{allItems.map((entry, i) => {
									const idx = canGoUp ? i + 1 : i;
									return (
										<button
											type="button"
											key={entry.path}
											data-index={idx}
											onMouseEnter={() => setActiveIndex(idx)}
											onClick={() => {
												if (entry.isDirectory) {
													setCurrentDir(entry.path);
												} else {
													onSelect({ path: entry.path, name: entry.name, isDirectory: false });
												}
											}}
											className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors"
											style={{ background: idx === activeIndex ? "var(--hover)" : "transparent" }}
										>
											<span className={`${fileIcon(entry.name, entry.isDirectory)} h-4 w-4 shrink-0 ${entry.isDirectory ? "text-[var(--text-2)]" : "text-[var(--text-3)]"}`} />
											<span className={`truncate text-[12.5px] ${entry.isDirectory ? "font-medium text-[var(--text-1)]" : "text-[var(--text-1)]"}`}>
												{entry.name}
											</span>
											{entry.isDirectory && (
												<span className="ml-auto text-[10px] text-[var(--text-3)]">
													Tab 进入
												</span>
											)}
										</button>
									);
								})}
							</div>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
