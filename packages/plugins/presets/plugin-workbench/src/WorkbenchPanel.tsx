import { useActiveConversation, useActivityTab, useTranslation } from "@vetta-org/plugin-sdk";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getWorkbenchCommand, getWorkbenchFs } from "./runtime";

interface ProjectInfo {
	dir: string;
	id: string;
	name: string;
	version: string;
	guidingWords: string[];
	permissions: string[];
	zipPath: string | null;
}

interface InstalledInfo {
	id: string;
	version: string;
	enabled: boolean;
	devWatch: VettaPluginDevWatchState | null;
}

function joinPath(base: string, ...parts: string[]): string {
	const sep = base.includes("\\") ? "\\" : "/";
	let out = base.replace(/[/\\]+$/, "");
	for (const p of parts) {
		out = `${out}${sep}${p.replace(/^[/\\]+/, "")}`;
	}
	return out;
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
	try {
		const file = await getWorkbenchFs().readFile(path);
		return JSON.parse(file.content) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function discoverProjects(cwd: string): Promise<ProjectInfo[]> {
	const fs = getWorkbenchFs();
	const candidates: string[] = [cwd];
	try {
		const entries = await fs.readDir(cwd);
		for (const e of entries) {
			if (e.isDirectory && e.name !== "node_modules" && e.name !== "dist" && e.name !== ".git") {
				candidates.push(e.path || joinPath(cwd, e.name));
			}
		}
	} catch {
		// cwd unreadable
	}

	const projects: ProjectInfo[] = [];
	for (const dir of candidates) {
		const manifest = await readJson(joinPath(dir, "plugin.json"));
		if (!manifest || typeof manifest.id !== "string") continue;
		const id = manifest.id;
		const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
		const name = typeof manifest.name === "string" ? manifest.name : id;
		const guidingWords = Array.isArray(manifest.guidingWords)
			? manifest.guidingWords.filter((w): w is string => typeof w === "string")
			: [];
		const permissions = Array.isArray(manifest.permissions)
			? manifest.permissions.filter((p): p is string => typeof p === "string")
			: [];
		const zipPath = joinPath(dir, "release", `${id}-${version}.zip`);
		let zipExists = false;
		try {
			zipExists = (await fs.stat(zipPath)) != null;
		} catch {
			zipExists = false;
		}
		projects.push({
			dir,
			id,
			name,
			version,
			guidingWords,
			permissions,
			zipPath: zipExists ? zipPath : null,
		});
	}
	return projects;
}

// ─── Icons (created at render — never at module top level in an MF remote) ───

function WrenchIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
			<path
				fill="currentColor"
				d="M22.7 19.3 13.6 10.2a6 6 0 0 0-7.8-7.8l3.1 3.1-2.1 2.1-3.1-3.1A6 6 0 0 0 10.2 13.6l9.1 9.1a1 1 0 0 0 1.4 0l2-2a1 1 0 0 0 0-1.4Z"
			/>
		</svg>
	);
}

function RefreshIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FolderIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function AlertIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PackageIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="m12.5 3.1 7 3.5a1 1 0 0 1 .5.87v8.06a1 1 0 0 1-.5.87l-7 3.5a1 1 0 0 1-.9 0l-7-3.5a1 1 0 0 1-.5-.87V7.47a1 1 0 0 1 .5-.87l7-3.5a1 1 0 0 1 .9 0Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			<path d="M12 12 3.5 7.75M12 12l8.5-4.25M12 12v9.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
		</svg>
	);
}

// ─── Shared button styles (token-aligned; plugins cannot import host Button) ───

const btnBase =
	"inline-flex h-7 items-center justify-center gap-1 rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
const btnGhost = `${btnBase} text-muted-foreground hover:bg-accent hover:text-foreground`;
const btnSecondary = `${btnBase} border border-border/60 bg-secondary/50 text-foreground hover:bg-secondary`;
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnDestructive = `${btnBase} text-destructive hover:bg-destructive/10`;
const btnIcon =
	"flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const fieldClass =
	"w-full rounded-md border border-border/60 bg-input/30 px-2.5 py-1.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-inset focus:ring-primary/30";

function shortPath(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	if (parts.length <= 3) return path;
	return `…/${parts.slice(-3).join("/")}`;
}

function busyLabel(busy: string, t: (key: string) => string): string {
	const kind = busy.split(":")[0] ?? busy;
	const map: Record<string, string> = {
		build: t("panel.busyBuild"),
		apply: t("panel.busyApply"),
		uninstall: t("panel.busyUninstall"),
		reload: t("panel.busyReload"),
		save: t("panel.busySave"),
		hotreload: t("panel.busyHotReload"),
		export: t("panel.busyExport"),
	};
	return map[kind] ?? t("panel.busy");
}

export function WorkbenchPanel() {
	const { t } = useTranslation();
	const tab = useActivityTab();
	const convo = useActiveConversation();
	// Prefer activity panel cwd (project page); fall back to active conversation.
	const cwd = tab.cwd ?? convo.cwd;

	const [projects, setProjects] = useState<ProjectInfo[]>([]);
	const [installed, setInstalled] = useState<Map<string, InstalledInfo>>(new Map());
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [workbenchRoot, setWorkbenchRoot] = useState<string | null>(null);
	const [edits, setEdits] = useState<Record<string, { name: string; guidingWords: string }>>({});

	const refresh = useCallback(async () => {
		setError(null);
		try {
			const list = await window.vetta.plugins.list();
			const map = new Map<string, InstalledInfo>();
			let wbRoot: string | null = null;
			for (const p of list) {
				map.set(p.id, { id: p.id, version: p.version, enabled: p.enabled, devWatch: p.devWatch ?? null });
				if (p.id === "plugin-workbench" && p.rootPath) wbRoot = p.rootPath;
			}
			setInstalled(map);
			setWorkbenchRoot(wbRoot);
			if (cwd) {
				const found = await discoverProjects(cwd);
				setProjects(found);
				const nextEdits: Record<string, { name: string; guidingWords: string }> = {};
				for (const p of found) {
					nextEdits[p.id] = {
						name: p.name,
						guidingWords: p.guidingWords.join("\n"),
					};
				}
				setEdits(nextEdits);
			} else {
				setProjects([]);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [cwd]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const runBuild = async (project: ProjectInfo) => {
		if (!workbenchRoot) {
			setError("plugin-workbench rootPath missing");
			return;
		}
		setBusy(`build:${project.id}`);
		setError(null);
		try {
			const script = joinPath(workbenchRoot, "scripts", "build-and-pack.mjs");
			const result = await getWorkbenchCommand().run("node", [script, project.dir], {
				cwd: project.dir,
				timeoutMs: 120_000,
			});
			if (result.exitCode !== 0) {
				throw new Error(result.stderr || result.stdout || `exit ${result.exitCode}`);
			}
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const runApply = async (project: ProjectInfo) => {
		setBusy(`apply:${project.id}`);
		setError(null);
		try {
			let zip = project.zipPath;
			if (!zip) {
				setBusy(`build:${project.id}`);
				if (!workbenchRoot) throw new Error("plugin-workbench rootPath missing");
				const script = joinPath(workbenchRoot, "scripts", "build-and-pack.mjs");
				const result = await getWorkbenchCommand().run("node", [script, project.dir], {
					cwd: project.dir,
					timeoutMs: 120_000,
				});
				if (result.exitCode !== 0) {
					throw new Error(result.stderr || result.stdout || `exit ${result.exitCode}`);
				}
				const manifest = await readJson(joinPath(project.dir, "plugin.json"));
				const version = typeof manifest?.version === "string" ? manifest.version : project.version;
				zip = joinPath(project.dir, "release", `${project.id}-${version}.zip`);
			}
			const st = await getWorkbenchFs().stat(zip);
			if (!st) throw new Error(`Zip not found: ${zip}`);

			await window.vetta.plugins.installFromPath(zip, {
				grantedPermissions: project.permissions,
				enable: true,
			});
			await window.vetta.plugins.setEnabled(project.id, true);
			if (project.permissions.length > 0) {
				await window.vetta.plugins.grantPermissions(project.id, project.permissions);
			}
			try {
				await window.vetta.plugins.reload(project.id);
			} catch {
				// first install may not need reload
			}
			// Host also broadcasts plugins:changed; window event covers same-frame listeners.
			window.dispatchEvent(new Event("vetta:plugins-changed"));
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const runUninstall = async (id: string) => {
		setBusy(`uninstall:${id}`);
		setError(null);
		try {
			await window.vetta.plugins.uninstall(id);
			window.dispatchEvent(new Event("vetta:plugins-changed"));
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const runReload = async (id: string) => {
		setBusy(`reload:${id}`);
		setError(null);
		try {
			await window.vetta.plugins.reload(id);
			window.dispatchEvent(new Event("vetta:plugins-changed"));
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const toggleHotReload = async (project: ProjectInfo, inst: InstalledInfo) => {
		setBusy(`hotreload:${project.id}`);
		setError(null);
		try {
			if (inst.devWatch) {
				await window.vetta.plugins.stopDevWatch(project.id);
			} else {
				await window.vetta.plugins.startDevWatch(project.id, project.dir);
			}
			window.dispatchEvent(new Event("vetta:plugins-changed"));
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const saveManifest = async (project: ProjectInfo) => {
		const edit = edits[project.id];
		if (!edit) return;
		setBusy(`save:${project.id}`);
		setError(null);
		try {
			const path = joinPath(project.dir, "plugin.json");
			const manifest = (await readJson(path)) ?? {};
			manifest.name = edit.name.trim() || project.name;
			manifest.guidingWords = edit.guidingWords
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
			await getWorkbenchFs().writeFile(path, `${JSON.stringify(manifest, null, "\t")}\n`);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const runExport = async (project: ProjectInfo) => {
		if (!project.zipPath) {
			setError(t("panel.exportNeedsZip"));
			return;
		}
		setBusy(`export:${project.id}`);
		setError(null);
		try {
			const defaultFileName = `${project.id}-${project.version}.zip`;
			const saved = await window.vetta.dialog.saveCopy(project.zipPath, {
				defaultFileName,
				title: t("panel.exportTitle"),
				filters: [{ name: "Zip", extensions: ["zip"] }],
			});
			// null = user cancelled the save dialog; no error.
			if (saved == null) return;
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	};

	const isBusy = busy !== null;
	const showEmpty = Boolean(cwd) && projects.length === 0 && !isBusy;

	return (
		<div className="flex h-full min-h-0 flex-col text-foreground">
			{/* Toolbar — aligned with Git / image-gen activity tabs */}
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
				<div className="flex min-w-0 items-center gap-1.5">
					<WrenchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate text-[12px] font-medium text-foreground">{t("panel.title")}</span>
					{projects.length > 0 && (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
							{projects.length}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={isBusy}
					className={btnIcon}
					title={t("panel.scan")}
				>
					<RefreshIcon className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
				{/* Mode hint */}
				<div className="rounded-lg border border-border/40 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
					{t("panel.hintMode")}
				</div>

				{/* Error */}
				{error && (
					<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
						<AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<div className="min-w-0 flex-1">
							<div className="font-medium">{t("panel.error")}</div>
							<pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[11px] text-destructive/90">
								{error}
							</pre>
						</div>
						<button type="button" className={btnGhost} onClick={() => setError(null)}>
							{t("panel.dismiss")}
						</button>
					</div>
				)}

				{/* Busy bar */}
				{busy && (
					<div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[12px] text-primary">
						<RefreshIcon className="h-3.5 w-3.5 animate-spin" />
						<span>{busyLabel(busy, t)}</span>
					</div>
				)}

				{/* No cwd */}
				{!cwd && (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
							<FolderIcon className="h-5 w-5" />
						</div>
						<div className="space-y-1">
							<p className="text-[13px] font-medium text-foreground">{t("panel.noCwdTitle")}</p>
							<p className="max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
								{t("panel.noCwd")}
							</p>
						</div>
					</div>
				)}

				{/* Empty projects */}
				{showEmpty && (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<PackageIcon className="h-5 w-5" />
						</div>
						<div className="space-y-1">
							<p className="text-[13px] font-medium text-foreground">{t("panel.emptyTitle")}</p>
							<p className="max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
								{t("panel.empty")}
							</p>
						</div>
						<button type="button" className={btnSecondary} onClick={() => void refresh()} disabled={isBusy}>
							<RefreshIcon className="h-3.5 w-3.5" />
							{t("panel.scan")}
						</button>
					</div>
				)}

				{/* Project cards */}
				{projects.map((project) => {
					const inst = installed.get(project.id);
					const edit = edits[project.id] ?? { name: project.name, guidingWords: "" };
					const projectBusy = busy?.endsWith(`:${project.id}`) ?? false;

					return (
						<article
							key={project.dir}
							className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 px-3.5 pb-3 pt-3 backdrop-blur-sm transition-colors duration-200 hover:border-border hover:bg-card/60"
						>
							{/* Card header */}
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="truncate text-[13px] font-semibold text-foreground">{project.id}</span>
										<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
											v{project.version}
											{inst && inst.version !== project.version ? ` → ${inst.version}` : ""}
										</span>
									</div>
									<p
										className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80"
										title={project.dir}
									>
										{shortPath(project.dir)}
									</p>
								</div>
								{inst ? (
									<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
										<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
										{t("panel.installed")}
									</span>
								) : (
									<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
										<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
										{t("panel.notInstalled")}
									</span>
								)}
							</div>

							{/* Meta chips */}
							<div className="flex flex-wrap gap-1.5">
								{project.zipPath ? (
									<span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
										{t("panel.zipReady")}
									</span>
								) : (
									<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										{t("panel.zipMissing")}
									</span>
								)}
								{project.permissions.length > 0 && (
									<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										{t("panel.permCount", { count: project.permissions.length })}
									</span>
								)}
								{project.guidingWords.length > 0 && (
									<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										{t("panel.guideCount", { count: project.guidingWords.length })}
									</span>
								)}
							</div>

							{/* Form */}
							<div className="flex flex-col gap-2.5">
								<label className="flex flex-col gap-1">
									<span className="text-[11px] font-medium text-muted-foreground">{t("panel.name")}</span>
									<input
										className={fieldClass}
										value={edit.name}
										onChange={(e) =>
											setEdits((prev) => ({
												...prev,
												[project.id]: { ...edit, name: e.target.value },
											}))
										}
									/>
								</label>
								<label className="flex flex-col gap-1">
									<span className="text-[11px] font-medium text-muted-foreground">
										{t("panel.guidingWords")}
									</span>
									<textarea
										className={`${fieldClass} min-h-[4.5rem] resize-y leading-relaxed`}
										value={edit.guidingWords}
										onChange={(e) =>
											setEdits((prev) => ({
												...prev,
												[project.id]: { ...edit, guidingWords: e.target.value },
											}))
										}
									/>
								</label>
							</div>

							{/* Hot reload (dev) — off by default; requires an installed plugin */}
							<div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-2">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] font-medium text-foreground">{t("panel.hotReload")}</span>
										{inst?.devWatch?.status === "starting" && (
											<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
												{t("panel.hotReloadStarting")}
											</span>
										)}
										{inst?.devWatch?.status === "running" && (
											<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
												<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
												{t("panel.hotReloadRunning")}
											</span>
										)}
										{inst?.devWatch?.status === "error" && (
											<span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
												{t("panel.hotReloadError")}
											</span>
										)}
									</div>
									<p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
										{inst ? t("panel.hotReloadHint") : t("panel.hotReloadNeedsInstall")}
									</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={Boolean(inst?.devWatch)}
									aria-label={t("panel.hotReload")}
									disabled={!inst || isBusy}
									onClick={() => inst && void toggleHotReload(project, inst)}
									className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40 ${
										inst?.devWatch ? "bg-primary" : "bg-muted-foreground/30"
									}`}
								>
									<span
										className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-[left] duration-150 ${
											inst?.devWatch ? "left-[18px]" : "left-0.5"
										}`}
									/>
								</button>
							</div>
							{inst?.devWatch?.status === "error" && inst.devWatch.error && (
								<pre className="whitespace-pre-wrap break-words rounded-lg bg-destructive/10 px-2.5 py-2 font-sans text-[10px] leading-relaxed text-destructive/90">
									{inst.devWatch.error}
								</pre>
							)}

							{/* Actions */}
							<div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
								<button
									type="button"
									className={btnSecondary}
									onClick={() => void saveManifest(project)}
									disabled={isBusy}
								>
									{t("panel.saveManifest")}
								</button>
								<button
									type="button"
									className={btnSecondary}
									onClick={() => void runBuild(project)}
									disabled={isBusy}
								>
									{t("panel.build")}
								</button>
								<button
									type="button"
									className={btnSecondary}
									onClick={() => void runExport(project)}
									disabled={isBusy || !project.zipPath}
									title={!project.zipPath ? t("panel.exportNeedsZip") : t("panel.export")}
								>
									{projectBusy && busy?.startsWith("export") ? (
										<RefreshIcon className="h-3 w-3 animate-spin" />
									) : null}
									{t("panel.export")}
								</button>
								<button
									type="button"
									className={btnPrimary}
									onClick={() => void runApply(project)}
									disabled={isBusy}
								>
									{projectBusy && busy?.startsWith("apply") ? (
										<RefreshIcon className="h-3 w-3 animate-spin" />
									) : null}
									{t("panel.apply")}
								</button>
								{inst && (
									<>
										<div className="mx-0.5 h-4 w-px bg-border/60" />
										<button
											type="button"
											className={btnGhost}
											onClick={() => void runReload(project.id)}
											disabled={isBusy}
										>
											{t("panel.reload")}
										</button>
										<button
											type="button"
											className={btnDestructive}
											onClick={() => void runUninstall(project.id)}
											disabled={isBusy}
										>
											{t("panel.uninstall")}
										</button>
									</>
								)}
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}
