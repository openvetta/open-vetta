/**
 * 画布撤销 / 重做：
 * - 栈本身（纯逻辑）：入栈、重做栈作废、深度上限、冲突丢弃；
 * - 会话里的 manifest 类操作（移动 / 改尺寸 / 圆角 / 展开）一次用户动作一条；
 * - 新建 / 删除 / 重命名会动源码，撤销要把文件写回或删掉；
 * - agent 在中间改过的 frame 不被静默覆盖，而是报冲突并放弃这一条。
 */
import { expect, it, vi } from "vitest";
// 版本历史的 git 引导不是这里要测的，且依赖宿主的 runner。
vi.mock("../src/history/history-bootstrap", () => ({ bootstrapHistory: async () => {} }));

import { DesignSession } from "../src/vetd/design-session";
import { fieldsOf, sameFields, UNDO_LIMIT, UndoHistory } from "../src/vetd/undo-history";

const VETD = "/w/demo.vetd";

function memoryCtx(initial: Record<string, string>) {
	const files = new Map(Object.entries(initial));
	const fs = {
		readFile: vi.fn(async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return { content };
		}),
		writeFile: vi.fn(async (path: string, content: string) => {
			files.set(path, content);
		}),
		delete: vi.fn(async (path: string) => {
			files.delete(path);
		}),
		stat: vi.fn(async (path: string) => (files.has(path) ? { isDirectory: false } : null)),
		readDir: vi.fn(async (dir: string) => {
			const prefix = `${dir}/`;
			const names = [...files.keys()]
				.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
				.map((path) => path.slice(prefix.length));
			if (names.length === 0) throw new Error(`ENOENT: ${dir}`);
			return names.map((name) => ({ name, path: `${dir}/${name}`, isDirectory: false }));
		}),
		watchDirectory: vi.fn(() => ({ dispose: vi.fn() })),
	};
	return { ctx: { fs } as never, files };
}

const source = (title: string, width = 390, height = 844) =>
	`export const frame = { width: ${width}, height: ${height}, title: "${title}" };\nexport default function F() { return null; }\n`;

async function openSession(extra: Record<string, string> = {}) {
	const { ctx, files } = memoryCtx({
		[`${VETD}/frames/home.tsx`]: source("首页"),
		[`${VETD}/frames/detail.tsx`]: source("详情"),
		...extra,
	});
	const session = new DesignSession(ctx, VETD);
	await session.open();
	return { session, files };
}

const frameOf = (session: DesignSession, id: string) => {
	const frame = session.manifest.frames.find((entry) => entry.id === id);
	if (!frame) throw new Error(`no frame ${id}`);
	return frame;
};

it("UndoHistory: a new action clears redo, caps depth, and drops conflicting entries", () => {
	const history = new UndoHistory();
	const entry = { type: "rename", id: "a", before: "x", after: "y" } as const;
	history.record(entry);
	history.markUndone();
	expect(history.canRedo).toBe(true);
	history.record(entry);
	expect(history.canRedo).toBe(false);

	for (let i = 0; i < UNDO_LIMIT + 20; i += 1) history.record(entry);
	let depth = 0;
	while (history.canUndo) {
		history.dropUndoTop();
		depth += 1;
	}
	expect(depth).toBe(UNDO_LIMIT);
});

it("fieldsOf / sameFields treat missing radius and collapsed state as defaults", () => {
	const base = { x: 0, y: 0, width: 10, height: 10 };
	expect(sameFields(fieldsOf(base), fieldsOf({ ...base, expanded: undefined }))).toBe(true);
	expect(sameFields(fieldsOf(base), fieldsOf({ ...base, radius: 0 }))).toBe(false);
	expect(sameFields(fieldsOf({ ...base, expanded: true }), fieldsOf(base))).toBe(false);
});

it("undoes and redoes a move, one entry per user action", async () => {
	const { session } = await openSession();
	const before = fieldsOf(frameOf(session, "home"));
	session.updateFramePlacements(new Map([["home", { x: 500, y: 40 }]]));
	session.updateFramePlacements(new Map([["home", { x: 900, y: 80 }]]));

	expect(await session.undo()).toMatchObject({ status: "done", kind: "move", ids: ["home"] });
	expect(frameOf(session, "home")).toMatchObject({ x: 500, y: 40 });
	expect(await session.undo()).toMatchObject({ status: "done", ids: ["home"] });
	expect(fieldsOf(frameOf(session, "home"))).toEqual(before);
	expect(await session.undo()).toEqual({ status: "empty" });

	expect(await session.redo()).toMatchObject({ status: "done" });
	expect(frameOf(session, "home")).toMatchObject({ x: 500, y: 40 });
});

it("merges a transaction (collapse + resize + radius) into a single entry", async () => {
	const { session } = await openSession();
	session.setFrameExpanded("home", true);
	session.undoHistory.clear();

	session.transact("size", () => {
		session.setFrameExpanded("home", false);
		session.updateFramePlacement("home", { width: 393, height: 852, radius: 62 }, "size");
	});
	expect(frameOf(session, "home")).toMatchObject({ width: 393, height: 852, radius: 62 });
	expect(frameOf(session, "home").expanded).toBeUndefined();

	expect(await session.undo()).toMatchObject({ status: "done", kind: "size" });
	expect(frameOf(session, "home")).toMatchObject({ width: 390, height: 844, expanded: true });
	expect(frameOf(session, "home").radius).toBeUndefined();
	// 整个事务只有一条。
	expect(await session.undo()).toEqual({ status: "empty" });
});

it("does not record no-op changes", async () => {
	const { session } = await openSession();
	session.updateFramePlacement("home", { x: frameOf(session, "home").x });
	expect(session.undoHistory.canUndo).toBe(false);
});

it("undoes a creation by deleting the file and redoes it with the same id, position and radius", async () => {
	const { session, files } = await openSession();
	const id = await session.createFrame("新画框", 393, 852, 2000, 100, 62);
	expect(files.has(`${VETD}/frames/${id}.tsx`)).toBe(true);
	expect(frameOf(session, id)).toMatchObject({ x: 2000, y: 100, radius: 62 });

	expect(await session.undo()).toMatchObject({ status: "done", kind: "create", ids: [] });
	expect(files.has(`${VETD}/frames/${id}.tsx`)).toBe(false);
	expect(session.manifest.frames.some((frame) => frame.id === id)).toBe(false);

	expect(await session.redo()).toMatchObject({ status: "done", ids: [id] });
	expect(files.has(`${VETD}/frames/${id}.tsx`)).toBe(true);
	expect(frameOf(session, id)).toMatchObject({ x: 2000, y: 100, width: 393, height: 852, radius: 62 });
});

it("undoes a deletion by restoring the source and the user's size, radius and position", async () => {
	const { session, files } = await openSession();
	session.updateFramePlacement("detail", { width: 500, height: 600, radius: 20 }, "size");
	session.updateFramePlacements(new Map([["detail", { x: 777, y: 55 }]]));
	const snapshot = fieldsOf(frameOf(session, "detail"));
	const original = files.get(`${VETD}/frames/detail.tsx`);

	await session.deleteFrame("detail");
	expect(files.has(`${VETD}/frames/detail.tsx`)).toBe(false);

	expect(await session.undo()).toMatchObject({ status: "done", kind: "delete", ids: ["detail"] });
	expect(files.get(`${VETD}/frames/detail.tsx`)).toBe(original);
	expect(fieldsOf(frameOf(session, "detail"))).toEqual(snapshot);

	// 重做 = 再删一次。
	expect(await session.redo()).toMatchObject({ status: "done", kind: "delete", ids: [] });
	expect(files.has(`${VETD}/frames/detail.tsx`)).toBe(false);
});

it("undoes and redoes a rename through the tsx meta", async () => {
	const { session, files } = await openSession();
	await session.renameFrame("home", "新首页");
	expect(frameOf(session, "home").title).toBe("新首页");
	expect(files.get(`${VETD}/frames/home.tsx`)).toContain("新首页");

	expect(await session.undo()).toMatchObject({ status: "done", kind: "rename" });
	expect(frameOf(session, "home").title).toBe("首页");
	expect(files.get(`${VETD}/frames/home.tsx`)).toContain("首页");

	expect(await session.redo()).toMatchObject({ status: "done" });
	expect(frameOf(session, "home").title).toBe("新首页");
});

it("reports a conflict instead of overwriting when the agent changed the frame in between", async () => {
	const { session, files } = await openSession();
	session.updateFramePlacement("home", { width: 500, height: 700 });
	// agent 改了画框的尺寸声明，reconcile 让 manifest 跟着它走。
	files.set(`${VETD}/frames/home.tsx`, source("首页", 600, 900));
	await session.reconcile();
	expect(frameOf(session, "home")).toMatchObject({ width: 600, height: 900 });

	expect(await session.undo()).toEqual({ status: "conflict", kind: "resize" });
	// 没有被覆盖，这一条也被放弃，不会反复报同一个冲突。
	expect(frameOf(session, "home")).toMatchObject({ width: 600, height: 900 });
	expect(session.undoHistory.canUndo).toBe(false);
});

it("will not delete a freshly created frame once the agent has drawn in it", async () => {
	const { session, files } = await openSession();
	const id = await session.createFrame("新画框", 393, 852, 2000, 100);
	files.set(`${VETD}/frames/${id}.tsx`, `${files.get(`${VETD}/frames/${id}.tsx`)}// agent 画的内容\n`);

	expect(await session.undo()).toEqual({ status: "conflict", kind: "create" });
	expect(files.has(`${VETD}/frames/${id}.tsx`)).toBe(true);
});

it("a new user action invalidates redo, and reload clears both stacks", async () => {
	const { session } = await openSession();
	session.updateFramePlacements(new Map([["home", { x: 10, y: 10 }]]));
	await session.undo();
	expect(session.undoHistory.canRedo).toBe(true);
	session.updateFramePlacements(new Map([["home", { x: 20, y: 20 }]]));
	expect(session.undoHistory.canRedo).toBe(false);

	await session.reload();
	expect(session.undoHistory.canUndo).toBe(false);
	expect(session.undoHistory.canRedo).toBe(false);
});

it("emits a history change so the toolbar can follow the stacks", async () => {
	const { session } = await openSession();
	const changes: string[] = [];
	session.on((change) => changes.push(change));
	session.updateFramePlacements(new Map([["home", { x: 33, y: 33 }]]));
	expect(changes).toContain("history");
});
