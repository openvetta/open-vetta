import type { Disposable, PluginContext } from "@vetta-org/plugin-sdk";
import { isFrameFile } from "../../engine/src/routes";
import { bootstrapHistory } from "../history/history-bootstrap";
import { type ParsedFrameMeta, parseFrameMeta, sameMeta, sanitizeFrameTitle, withFrameTitle } from "./frame-meta";
import { FALLBACK_FRAME_SIZE, resolveFrameSizes } from "./frame-size";
import {
	designNameOf,
	emptyManifest,
	type FrameMeta,
	manifestPathOf,
	type VetdCanvasViewport,
	type VetdFrameEntry,
	type VetdManifest,
} from "./manifest-types";
import { blankFrameBackground, blankFrameSource } from "./scaffold";
import {
	type FrameFields,
	entryKind,
	fieldsOf,
	sameFields,
	type UndoEntry,
	UndoHistory,
	type UndoKind,
} from "./undo-history";

export const FRAME_GAP = 80;
const RECONCILE_DEBOUNCE_MS = 150;
const VIEWPORT_SAVE_DEBOUNCE_MS = 800;

interface RecoveredFrameEntry {
	readonly frame: VetdFrameEntry;
	readonly repaired: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Converts externally edited manifest data into the complete internal frame contract. */
function recoverFrameEntry(value: unknown): RecoveredFrameEntry | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string" || value.id.length === 0) return null;
	if (typeof value.file !== "string" || value.file.length === 0) return null;
	if (!finiteNumber(value.x) || !finiteNumber(value.y)) return null;
	if (!finiteNumber(value.width) || !finiteNumber(value.height)) return null;

	const title = typeof value.title === "string" ? value.title : value.id;
	const rawMeta = value.meta;
	// 逐字段取出来而不是把 rawMeta 原样收下：外部写的 manifest 里什么都可能有。
	const meta: FrameMeta | null =
		isRecord(rawMeta) && finiteNumber(rawMeta.width) && finiteNumber(rawMeta.height) && typeof rawMeta.title === "string"
			? {
					width: rawMeta.width,
					height: rawMeta.height,
					title: rawMeta.title,
					...(finiteNumber(rawMeta.radius) && rawMeta.radius >= 0 ? { radius: rawMeta.radius } : {}),
				}
			: null;
	const hasMeta = meta !== null;
	return {
		frame: {
			id: value.id,
			file: value.file,
			x: value.x,
			y: value.y,
			width: value.width,
			height: value.height,
			title,
			// An invalid snapshot must differ from every resolved frame declaration so reconcile repairs it.
			meta: meta ?? { width: -1, height: -1, title: "" },
			...(value.expanded === true ? { expanded: true as const } : {}),
			...(finiteNumber(value.radius) && value.radius >= 0 ? { radius: value.radius } : {}),
		},
		repaired: !hasMeta || title !== value.title,
	};
}

export type DesignChange = "frames" | "theme" | "history";

/** 撤销 / 重做的结果：done 带上受影响且仍存在的 frame（画布据此选中）；conflict = 这一步已被改动过，无法执行。 */
export type UndoOutcome =
	| { status: "empty" }
	| { status: "done"; kind: UndoKind; ids: string[] }
	| { status: "conflict"; kind: UndoKind };

/**
 * One open design bundle (`x.vetd/`). Owns the manifest (single writer): the
 * agent and the user only touch the sources; every manifest mutation flows
 * through this class. Reconcile rules (ADR-0053): tsx meta is the DECLARATION
 * (initial size / follow on change), the manifest is the CURRENT state (user
 * drags win until the meta changes again).
 */
export class DesignSession {
	/** The bundle directory. Same value as {@link dirPath} — see ADR-0066. */
	readonly vetdPath: string;
	readonly dirPath: string;
	readonly manifestPath: string;
	readonly name: string;
	manifest: VetdManifest = emptyManifest();

	private readonly ctx: PluginContext;
	private readonly listeners = new Set<(change: DesignChange) => void>();
	private readonly watchHandles: Disposable[] = [];
	private readonly pendingPlacements = new Map<string, { x: number; y: number }>();
	private reconcileTimer: number | null = null;
	/** 上一次读到的 theme.css，用来把「真的改了色板」从自触发的监听事件里分出来。 */
	private lastThemeCss: string | null = null;
	private viewportTimer: number | null = null;
	private disposed = false;
	private writing = Promise.resolve();
	private manifestNeedsRepair = false;
	/** 用户操作的撤销 / 重做栈（只在内存里，关掉设计就清空；跨重启由版本历史兜底）。 */
	readonly undoHistory = new UndoHistory();
	/** 进行中的事务：把同一次用户操作里的多步写入合成一条记录。 */
	private txn: { kind: UndoKind; before: Map<string, FrameFields> } | null = null;
	private undoQueue: Promise<unknown> = Promise.resolve();

	constructor(ctx: PluginContext, vetdPath: string) {
		this.ctx = ctx;
		this.vetdPath = vetdPath;
		this.dirPath = vetdPath;
		this.manifestPath = manifestPathOf(vetdPath);
		this.name = designNameOf(vetdPath);
	}

	on(listener: (change: DesignChange) => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	private emit(change: DesignChange): void {
		for (const listener of this.listeners) listener(change);
	}

	private async loadManifest(): Promise<void> {
		try {
			const raw = await this.ctx.fs.readFile(this.manifestPath);
			const parsed = JSON.parse(raw.content) as unknown;
			if (isRecord(parsed) && parsed.type === "vetta-design" && Array.isArray(parsed.frames)) {
				const recovered = parsed.frames.map(recoverFrameEntry);
				const frames = recovered.filter((entry): entry is RecoveredFrameEntry => entry !== null);
				this.manifestNeedsRepair =
					frames.length !== parsed.frames.length || frames.some((entry) => entry.repaired);
				this.manifest = {
					...emptyManifest(),
					...parsed,
					canvas: { ...emptyManifest().canvas, ...(isRecord(parsed.canvas) ? parsed.canvas : {}) },
					frames: frames.map((entry) => entry.frame),
				};
				return;
			}
		} catch {
			// Corrupt/missing manifest: rebuild from the bundle sources (frames re-place).
		}
		this.manifest = emptyManifest();
		this.manifestNeedsRepair = false;
	}

	/**
	 * 整份重载。给「恢复到某个历史版本」用（ADR-0069）：那一步在磁盘上整份换掉了
	 * 源码和 design.json，而目录监听走的是增量对账，认不出「manifest 自己被换了」
	 * ——画框位置会停在旧值上。
	 */
	async reload(): Promise<void> {
		if (this.disposed) return;
		// 整份内容被换掉（版本恢复、进出历史预览）：栈里的前后状态全部作废。
		this.undoHistory.clear();
		this.emit("history");
		await this.loadManifest();
		await this.reconcile();
		this.emit("frames");
		await this.emitThemeIfChanged();
	}

	async open(): Promise<void> {
		await this.loadManifest();
		await this.reconcile();
		// 版本历史在这里接上（ADR-0069）。放在 reconcile 之后：基础版本应该包含
		// 已经收敛的 design.json，而不是打开瞬间的中间态。不等它——历史不可用
		// 时设计照常打开。
		void bootstrapHistory(this.ctx, this);
		this.lastThemeCss = await this.readThemeCss();
		const schedule = () => this.scheduleReconcile();
		this.watchHandles.push(this.ctx.fs.watchDirectory(this.dirPath, schedule));
		this.watchHandles.push(this.ctx.fs.watchDirectory(`${this.dirPath}/frames`, schedule));
	}

	dispose(): void {
		this.disposed = true;
		for (const handle of this.watchHandles) handle.dispose();
		this.watchHandles.length = 0;
		if (this.reconcileTimer !== null) window.clearTimeout(this.reconcileTimer);
		if (this.viewportTimer !== null) window.clearTimeout(this.viewportTimer);
		this.listeners.clear();
	}

	/**
	 * 目录监听回调。manifest 就在被监听的包里（ADR-0066），所以**我们自己**的每一次
	 * 落盘（拖动、平移视口）都会绕回这里；宿主的事件只带被监听的目录路径，认不出
	 * 是哪个文件变的。因此对外的通知一律按「内容真的变了」再发：reconcile 只在
	 * frame 集合/声明变化时 emit，theme 按内容比对。否则拖一下画框就会全画布重渲染
	 * 加一次重截图。
	 */
	private scheduleReconcile(): void {
		if (this.disposed) return;
		if (this.reconcileTimer !== null) window.clearTimeout(this.reconcileTimer);
		this.reconcileTimer = window.setTimeout(() => {
			this.reconcileTimer = null;
			void this.reconcile().then(() => this.emitThemeIfChanged());
		}, RECONCILE_DEBOUNCE_MS);
	}

	private async emitThemeIfChanged(): Promise<void> {
		if (this.disposed) return;
		const css = await this.readThemeCss();
		if (css === this.lastThemeCss) return;
		this.lastThemeCss = css;
		this.emit("theme");
	}

	/** Scan `frames/*.tsx`, apply the meta/manifest ownership rules, persist if changed. */
	async reconcile(): Promise<void> {
		if (this.disposed) return;
		let files: { name: string; path: string }[] = [];
		try {
			const entries = await this.ctx.fs.readDir(`${this.dirPath}/frames`);
			files = entries
				// isFrameFile 排掉 `_` 开头的路由结构件（`_layout.tsx`）：它是公共外壳，
				// 不是一屏内容，画布上不该为它多出一个空画板。
				.filter((entry) => !entry.isDirectory && entry.name.endsWith(".tsx") && isFrameFile(entry.name))
				.map((entry) => ({ name: entry.name, path: entry.path }));
		} catch {
			files = [];
		}

		const nextFrames: VetdFrameEntry[] = [];
		const known = new Map(this.manifest.frames.map((frame) => [frame.id, frame]));
		let dirty = this.manifestNeedsRepair;

		const sorted = files.sort((a, b) => a.name.localeCompare(b.name));
		const parsedFiles: { file: { name: string; path: string }; id: string; parsed: ParsedFrameMeta }[] = [];
		for (const file of sorted) {
			const id = file.name.replace(/\.tsx$/, "");
			let source = "";
			try {
				source = (await this.ctx.fs.readFile(file.path)).content;
			} catch {
				// unreadable frame: keep going with defaults
			}
			parsedFiles.push({ file, id, parsed: parseFrameMeta(source, id) });
		}
		// 尺寸解析先于建条目：漏声明的画框拿多数派尺寸上画布，而不是掉出去。缺声明
		// 本身照常由 checkSources 报成 `frame-size-missing`——渲染和报错是两件事。
		// 整份设计都没有多数派时退到创建时声明的品类，而不是写死的桌面尺寸。
		const sizes = resolveFrameSizes(
			parsedFiles.map(({ id, parsed }) => ({ id, parsed, existing: known.get(id)?.meta ?? null })),
			this.manifest.defaultFrameSize ?? null,
		);

		for (const { file, id, parsed } of parsedFiles) {
			const existing = known.get(id);
			const size = sizes.get(id) ?? FALLBACK_FRAME_SIZE;
			const meta: FrameMeta = {
				width: size.width,
				height: size.height,
				title: parsed.title,
				...(parsed.radius !== null ? { radius: parsed.radius } : {}),
			};
			if (!existing) {
				const placement = this.pendingPlacements.get(id) ?? this.autoPlacement(nextFrames);
				this.pendingPlacements.delete(id);
				nextFrames.push({
					id,
					file: `frames/${file.name}`,
					x: placement.x,
					y: placement.y,
					width: meta.width,
					height: meta.height,
					title: meta.title,
					meta,
					...(meta.radius !== undefined ? { radius: meta.radius } : {}),
				});
				dirty = true;
				continue;
			}
			known.delete(id);
			if (!sameMeta(meta, existing.meta)) {
				// Agent changed the declaration → manifest follows (last writer wins).
				nextFrames.push({
					...existing,
					width: meta.width,
					height: meta.height,
					title: meta.title,
					meta,
					// 圆角只在 agent 改了「圆角这一项声明」时才跟：只改了尺寸 / 标题不能把用户调过的
					// 圆角冲掉；声明被删掉（没意见）同样保留现有圆角。
					...(meta.radius !== undefined && meta.radius !== existing.meta.radius ? { radius: meta.radius } : {}),
				});
				dirty = true;
			} else {
				nextFrames.push(existing);
			}
		}
		if (known.size > 0) dirty = true; // deleted frames

		this.manifest = { ...this.manifest, frames: nextFrames };
		if (!dirty) return;
		await this.persist();
		this.manifestNeedsRepair = false;
		this.emit("frames");
	}

	private autoPlacement(placed: VetdFrameEntry[]): { x: number; y: number } {
		const all = [...this.manifest.frames, ...placed];
		if (all.length === 0) return { x: 0, y: 0 };
		const right = Math.max(...all.map((frame) => frame.x + frame.width));
		const top = Math.min(...all.map((frame) => frame.y));
		return { x: right + FRAME_GAP, y: top };
	}

	/**
	 * 记录一次 manifest 级别的用户操作：改动前先抓住受影响 frame 的字段，改完比较，有变化就入栈。
	 * 在 {@link transact} 里调用时只抓字段，由外层事务统一入栈（一次用户动作 = 一条记录）。
	 */
	private tracked(kind: UndoKind, ids: Iterable<string>, mutate: () => void): void {
		const owner = this.txn === null;
		const txn = this.txn ?? { kind, before: new Map<string, FrameFields>() };
		for (const id of ids) {
			if (txn.before.has(id)) continue;
			const frame = this.manifest.frames.find((entry) => entry.id === id);
			if (frame) txn.before.set(id, fieldsOf(frame));
		}
		if (!owner) {
			mutate();
			return;
		}
		this.txn = txn;
		try {
			mutate();
		} finally {
			this.txn = null;
		}
		this.recordPatch(txn);
	}

	/** 把里面的多步写入（比如「收起展开 + 改尺寸 + 改圆角」）合成撤销栈里的一条。 */
	transact(kind: UndoKind, fn: () => void): void {
		if (this.txn !== null) {
			fn();
			return;
		}
		const txn = { kind, before: new Map<string, FrameFields>() };
		this.txn = txn;
		try {
			fn();
		} finally {
			this.txn = null;
		}
		this.recordPatch(txn);
	}

	private recordPatch(txn: { kind: UndoKind; before: Map<string, FrameFields> }): void {
		const changes: { id: string; before: FrameFields; after: FrameFields }[] = [];
		for (const [id, before] of txn.before) {
			const frame = this.manifest.frames.find((entry) => entry.id === id);
			if (!frame) continue;
			const after = fieldsOf(frame);
			if (!sameFields(before, after)) changes.push({ id, before, after });
		}
		if (changes.length === 0) return;
		this.recordEntry({ type: "patch", kind: txn.kind, changes });
	}

	private recordEntry(entry: UndoEntry): void {
		this.undoHistory.record(entry);
		this.emit("history");
	}

	/** User drag/resize on the canvas — manifest-only, never written back to tsx. */
	updateFramePlacement(
		id: string,
		patch: Partial<Pick<VetdFrameEntry, "x" | "y" | "width" | "height" | "radius">>,
		kind: UndoKind = "resize",
	): void {
		this.tracked(kind, [id], () => {
			let changed = false;
			this.manifest = {
				...this.manifest,
				frames: this.manifest.frames.map((frame) => {
					if (frame.id !== id) return frame;
					changed = true;
					return { ...frame, ...patch };
				}),
			};
			if (!changed) return;
			this.emit("frames");
			void this.persist();
		});
	}

	/**
	 * 一次落多个 frame 的位置（自动排列、拖 gap、多选拖动）。
	 *
	 * 逐个调 {@link updateFramePlacement} 也能达到同样结果，但那是 N 次 emit + N 次
	 * 写盘：二十帧的整理会让画布连着重渲染二十遍，写队列也排二十个。
	 */
	updateFramePlacements(
		patches: ReadonlyMap<string, Partial<Pick<VetdFrameEntry, "x" | "y" | "width" | "height">>>,
		kind: UndoKind = "move",
	): void {
		if (patches.size === 0) return;
		this.tracked(kind, patches.keys(), () => {
			let changed = false;
			this.manifest = {
				...this.manifest,
				frames: this.manifest.frames.map((frame) => {
					const patch = patches.get(frame.id);
					if (!patch) return frame;
					changed = true;
					return { ...frame, ...patch };
				}),
			};
			if (!changed) return;
			this.emit("frames");
			void this.persist();
		});
	}

	/** 画布上展开/收缩 frame：只动显示状态，标准尺寸不变。 */
	setFrameExpanded(id: string, expanded: boolean): void {
		this.tracked("expand", [id], () => {
			let changed = false;
			this.manifest = {
				...this.manifest,
				frames: this.manifest.frames.map((frame) => {
					if (frame.id !== id || (frame.expanded === true) === expanded) return frame;
					changed = true;
					if (expanded) return { ...frame, expanded: true };
					const { expanded: _expanded, ...rest } = frame;
					return rest;
				}),
			};
			if (!changed) return;
			this.emit("frames");
			void this.persist();
		});
	}

	saveViewport(viewport: VetdCanvasViewport): void {
		this.manifest = { ...this.manifest, canvas: viewport };
		if (this.viewportTimer !== null) window.clearTimeout(this.viewportTimer);
		this.viewportTimer = window.setTimeout(() => {
			this.viewportTimer = null;
			void this.persist();
		}, VIEWPORT_SAVE_DEBOUNCE_MS);
	}

	/**
	 * Canvas "Frame" tool: scaffold a blank frame tsx at an explicit canvas spot.
	 * `radius` 随新建一并落进 manifest（预设尺寸带设备圆角），这样新建仍是撤销栈里的一条。
	 */
	async createFrame(
		title: string,
		width: number,
		height: number,
		x: number,
		y: number,
		radius?: number,
	): Promise<string> {
		const existing = new Set(this.manifest.frames.map((frame) => frame.id));
		let index = this.manifest.frames.length + 1;
		let id = `frame-${index}`;
		while (existing.has(id)) {
			index += 1;
			id = `frame-${index}`;
		}
		this.pendingPlacements.set(id, { x, y });
		const background = blankFrameBackground(await this.readThemeCss());
		// 带圆角的预设把声明也写进 tsx：agent 读源码就知道这是一台有圆角的设备。
		const source = blankFrameSource(title, width, height, background, radius);
		await this.ctx.fs.writeFile(`${this.dirPath}/frames/${id}.tsx`, source);
		await this.reconcile();
		const created = this.manifest.frames.find((frame) => frame.id === id);
		if (created) {
			if (radius !== undefined) {
				this.applyFields(id, { ...fieldsOf(created), radius });
				this.emit("frames");
				void this.persist();
			}
			const fresh = this.manifest.frames.find((frame) => frame.id === id);
			if (fresh) this.recordEntry({ type: "create", id, source, fields: fieldsOf(fresh) });
		}
		return id;
	}

	/** 把 frame 的用户可调字段整体写成给定值（缺省的 radius / expanded 即去掉）。不入栈、不发事件。 */
	private applyFields(id: string, fields: FrameFields): void {
		this.manifest = {
			...this.manifest,
			frames: this.manifest.frames.map((frame) => {
				if (frame.id !== id) return frame;
				const { radius: _radius, expanded: _expanded, ...rest } = frame;
				return {
					...rest,
					x: fields.x,
					y: fields.y,
					width: fields.width,
					height: fields.height,
					...(fields.radius !== undefined ? { radius: fields.radius } : {}),
					...(fields.expanded === true ? { expanded: true as const } : {}),
				};
			}),
		};
	}

	/**
	 * 画布上重命名 frame：写回 tsx 的 meta 声明（标题的真相在那里），manifest 先
	 * 乐观更新——文件监听到 reconcile 有防抖，等它回来标题会先跳回旧值再变。
	 */
	async renameFrame(id: string, rawTitle: string): Promise<void> {
		await this.renameFrameInner(id, rawTitle, true);
	}

	private async renameFrameInner(id: string, rawTitle: string, record: boolean): Promise<void> {
		const frame = this.manifest.frames.find((entry) => entry.id === id);
		if (!frame) return;
		const title = sanitizeFrameTitle(rawTitle);
		if (!title || title === frame.title) return;
		const path = `${this.dirPath}/${frame.file}`;
		const source = (await this.ctx.fs.readFile(path)).content;
		const next = withFrameTitle(source, title);
		if (next === null) throw new Error(`frame meta declaration not found in ${frame.file}`);
		this.manifest = {
			...this.manifest,
			frames: this.manifest.frames.map((entry) =>
				entry.id === id ? { ...entry, title, meta: { ...entry.meta, title } } : entry,
			),
		};
		this.emit("frames");
		await this.ctx.fs.writeFile(path, next);
		await this.persist();
		if (record) this.recordEntry({ type: "rename", id, before: frame.title, after: title });
	}

	/**
	 * 画布右键「删除 Frame」：包里的 tsx 才是真相，删掉源码后 reconcile
	 * 自然会把它从 manifest 里摘掉，不必单独改 manifest。
	 */
	async deleteFrame(id: string): Promise<void> {
		const frame = this.manifest.frames.find((entry) => entry.id === id);
		if (!frame) return;
		const fields = fieldsOf(frame);
		// 删除前先把源码存下来：撤销要靠它把文件写回去（宿主的删除没有回收站）。
		let source: string | null = null;
		try {
			source = (await this.ctx.fs.readFile(`${this.dirPath}/${frame.file}`)).content;
		} catch {
			source = null;
		}
		await this.ctx.fs.delete(`${this.dirPath}/${frame.file}`);
		await this.reconcile();
		if (source !== null) this.recordEntry({ type: "delete", id, source, fields });
	}

	/** 撤销用户的上一步操作。串行执行：连按快捷键时，上一步（可能要写文件）没落定不会开始下一步。 */
	undo(): Promise<UndoOutcome> {
		return this.enqueueUndo("undo");
	}

	redo(): Promise<UndoOutcome> {
		return this.enqueueUndo("redo");
	}

	private enqueueUndo(direction: "undo" | "redo"): Promise<UndoOutcome> {
		const run = this.undoQueue.then(() => this.stepHistory(direction));
		this.undoQueue = run.catch(() => undefined);
		return run;
	}

	private async stepHistory(direction: "undo" | "redo"): Promise<UndoOutcome> {
		const history = this.undoHistory;
		const entry = direction === "undo" ? history.undoTop : history.redoTop;
		if (!entry) return { status: "empty" };
		const kind = entryKind(entry);
		const ids = await this.applyEntry(entry, direction);
		if (ids === null) {
			// 这一步之后 frame 被别处改动过（多半是 agent）：放弃它，不静默覆盖。
			if (direction === "undo") history.dropUndoTop();
			else history.dropRedoTop();
			this.emit("history");
			return { status: "conflict", kind };
		}
		if (direction === "undo") history.markUndone();
		else history.markRedone();
		this.emit("history");
		return { status: "done", kind, ids: ids.filter((id) => this.manifest.frames.some((frame) => frame.id === id)) };
	}

	/** 执行一条记录；返回受影响的 frame id，前置条件不成立（已被改动）返回 null。 */
	private async applyEntry(entry: UndoEntry, direction: "undo" | "redo"): Promise<string[] | null> {
		const undoing = direction === "undo";
		switch (entry.type) {
			case "patch": {
				const expect = undoing ? "after" : "before";
				const target = undoing ? "before" : "after";
				for (const change of entry.changes) {
					const frame = this.manifest.frames.find((candidate) => candidate.id === change.id);
					if (!frame || !sameFields(fieldsOf(frame), change[expect])) return null;
				}
				for (const change of entry.changes) this.applyFields(change.id, change[target]);
				this.emit("frames");
				void this.persist();
				return entry.changes.map((change) => change.id);
			}
			case "create":
				return undoing ? this.removeFrameFile(entry.id, entry.source) : this.restoreFrameFile(entry);
			case "delete":
				return undoing ? this.restoreFrameFile(entry) : this.removeFrameFile(entry.id, entry.source);
			case "rename": {
				const frame = this.manifest.frames.find((candidate) => candidate.id === entry.id);
				if (!frame || frame.title !== (undoing ? entry.after : entry.before)) return null;
				try {
					await this.renameFrameInner(entry.id, undoing ? entry.before : entry.after, false);
				} catch {
					return null;
				}
				return [entry.id];
			}
		}
	}

	/** 删掉 frame 的源码；文件内容已不是记录里的那份（被 agent 画过）就不动它。 */
	private async removeFrameFile(id: string, source: string): Promise<string[] | null> {
		const frame = this.manifest.frames.find((candidate) => candidate.id === id);
		if (!frame) return null;
		const path = `${this.dirPath}/${frame.file}`;
		try {
			if ((await this.ctx.fs.readFile(path)).content !== source) return null;
		} catch {
			return null;
		}
		await this.ctx.fs.delete(path);
		await this.reconcile();
		return [id];
	}

	/** 把源码按原 id、原位置写回去，再补上用户调过的尺寸 / 圆角 / 展开态。id 已被占用就不动。 */
	private async restoreFrameFile(entry: { id: string; source: string; fields: FrameFields }): Promise<string[] | null> {
		const path = `${this.dirPath}/frames/${entry.id}.tsx`;
		if (this.manifest.frames.some((frame) => frame.id === entry.id) || (await this.ctx.fs.stat(path)) !== null) {
			return null;
		}
		this.pendingPlacements.set(entry.id, { x: entry.fields.x, y: entry.fields.y });
		await this.ctx.fs.writeFile(path, entry.source);
		await this.reconcile();
		if (!this.manifest.frames.some((frame) => frame.id === entry.id)) return null;
		this.applyFields(entry.id, entry.fields);
		this.emit("frames");
		void this.persist();
		return [entry.id];
	}

	async readThemeCss(): Promise<string> {
		try {
			return (await this.ctx.fs.readFile(`${this.dirPath}/theme.css`)).content;
		} catch {
			return "";
		}
	}

	private persist(): Promise<void> {
		// Serialize writes so rapid drag updates cannot interleave.
		const snapshot = `${JSON.stringify(this.manifest, null, "\t")}\n`;
		this.writing = this.writing
			.then(() => this.ctx.fs.writeFile(this.manifestPath, snapshot))
			.catch((error: unknown) => {
				console.error("vetd manifest write failed", error);
			});
		return this.writing;
	}
}
