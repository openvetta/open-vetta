import { useActiveConversation, useActivityTab, useTranslation } from "@vetta-org/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
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
				map.set(p.id, { id: p.id, version: p.version, enabled: p.enabled });
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

	return (
		<div className="vetta-plugin-workbench">
			<div className="wb-row" style={{ justifyContent: "space-between" }}>
				<h2>{t("panel.title")}</h2>
				<button type="button" onClick={() => void refresh()} disabled={busy !== null}>
					{t("panel.scan")}
				</button>
			</div>
			<p className="wb-muted">{t("panel.hintMode")}</p>
			{!cwd && <p className="wb-muted">No session cwd</p>}
			{error && (
				<div className="wb-error">
					{t("panel.error")}: {error}
				</div>
			)}
			{busy && (
				<p className="wb-muted">
					{t("panel.busy")} ({busy})
				</p>
			)}
			{cwd && projects.length === 0 && <p className="wb-muted">{t("panel.empty")}</p>}
			{projects.map((project) => {
				const inst = installed.get(project.id);
				const edit = edits[project.id] ?? { name: project.name, guidingWords: "" };
				return (
					<div key={project.dir} className="wb-card">
						<div className="wb-row" style={{ justifyContent: "space-between" }}>
							<strong>
								{project.id}{" "}
								<span className="wb-muted">
									v{project.version}
									{inst ? ` → ${inst.version}` : ""}
								</span>
							</strong>
							<span className="wb-badge">{inst ? t("panel.installed") : t("panel.notInstalled")}</span>
						</div>
						<p className="wb-muted">{project.dir}</p>
						<label>
							{t("panel.name")}
							<input
								value={edit.name}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[project.id]: { ...edit, name: e.target.value },
									}))
								}
							/>
						</label>
						<label>
							{t("panel.guidingWords")}
							<textarea
								value={edit.guidingWords}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[project.id]: { ...edit, guidingWords: e.target.value },
									}))
								}
							/>
						</label>
						<div className="wb-row">
							<button type="button" onClick={() => void saveManifest(project)} disabled={busy !== null}>
								{t("panel.saveManifest")}
							</button>
							<button type="button" onClick={() => void runBuild(project)} disabled={busy !== null}>
								{t("panel.build")}
							</button>
							<button
								type="button"
								className="primary"
								onClick={() => void runApply(project)}
								disabled={busy !== null}
							>
								{t("panel.apply")}
							</button>
							{inst && (
								<>
									<button type="button" onClick={() => void runReload(project.id)} disabled={busy !== null}>
										{t("panel.reload")}
									</button>
									<button type="button" onClick={() => void runUninstall(project.id)} disabled={busy !== null}>
										{t("panel.uninstall")}
									</button>
								</>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
