/**
 * frame 元数据里的可选 radius：agent 在 tsx 里声明，画布跟着；但不能冲掉用户在画布上调过的圆角。
 */
import { expect, it, vi } from "vitest";

vi.mock("../src/history/history-bootstrap", () => ({ bootstrapHistory: async () => {} }));

import { DesignSession } from "../src/vetd/design-session";
import { parseFrameMeta, sameMeta } from "../src/vetd/frame-meta";
import { blankFrameSource } from "../src/vetd/scaffold";

const VETD = "/w/demo.vetd";

it("parses an optional radius and distinguishes 'not declared' from 0", () => {
	expect(parseFrameMeta('export const frame = { width: 393, height: 852, title: "A", radius: 62 };', "a").radius).toBe(62);
	expect(parseFrameMeta('export const frame = { width: 393, height: 852, title: "A", radius: 47.33 };', "a").radius).toBe(47.33);
	expect(parseFrameMeta('export const frame = { width: 1, height: 1, title: "A", radius: 0 };', "a").radius).toBe(0);
	expect(parseFrameMeta('export const frame = { width: 1, height: 1, title: "A" };', "a").radius).toBeNull();
	// borderRadius 之类不是声明。
	expect(parseFrameMeta('export const frame = { width: 1, height: 1, title: "A", borderRadius: 9 };', "a").radius).toBeNull();
});

it("treats a radius change as a meta change", () => {
	const base = { width: 1, height: 1, title: "a" };
	expect(sameMeta(base, { ...base })).toBe(true);
	expect(sameMeta(base, { ...base, radius: 12 })).toBe(false);
});

it("writes the radius declaration into a blank frame only when given", () => {
	expect(blankFrameSource("x", 393, 852, "bg-white", 62)).toContain('title: "x", radius: 62 };');
	expect(blankFrameSource("x", 393, 852)).not.toContain("radius");
});

function memoryCtx(initial: Record<string, string>) {
	const files = new Map(Object.entries(initial));
	const fs = {
		readFile: async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT: ${path}`);
			return { content };
		},
		writeFile: async (path: string, content: string) => {
			files.set(path, content);
		},
		delete: async (path: string) => {
			files.delete(path);
		},
		stat: async (path: string) => (files.has(path) ? { isDirectory: false } : null),
		readDir: async (dir: string) => {
			const prefix = `${dir}/`;
			const names = [...files.keys()]
				.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
				.map((path) => path.slice(prefix.length));
			if (names.length === 0) throw new Error(`ENOENT: ${dir}`);
			return names.map((name) => ({ name, path: `${dir}/${name}`, isDirectory: false }));
		},
		watchDirectory: () => ({ dispose: () => {} }),
	};
	return { ctx: { fs } as never, files };
}

const src = (decl: string) => `export const frame = ${decl};\nexport default function F() { return null; }\n`;

it("a new frame the agent writes with a declared radius arrives rounded", async () => {
	const { ctx } = memoryCtx({
		[`${VETD}/frames/phone.tsx`]: src('{ width: 393, height: 852, title: "P", radius: 62 }'),
		[`${VETD}/frames/plain.tsx`]: src('{ width: 390, height: 844, title: "Q" }'),
	});
	const session = new DesignSession(ctx, VETD);
	await session.open();
	const phone = session.manifest.frames.find((frame) => frame.id === "phone");
	const plain = session.manifest.frames.find((frame) => frame.id === "plain");
	expect(phone?.radius).toBe(62);
	expect(plain?.radius).toBeUndefined();
});

it("follows a changed radius declaration but never overwrites the user's radius for other edits", async () => {
	const { ctx, files } = memoryCtx({
		[`${VETD}/frames/phone.tsx`]: src('{ width: 393, height: 852, title: "P", radius: 62 }'),
	});
	const session = new DesignSession(ctx, VETD);
	await session.open();

	// 用户在画布上把圆角调到 30。
	session.updateFramePlacement("phone", { radius: 30 }, "radius");
	// agent 只改了标题：声明里的 radius 没变，用户的 30 必须保留。
	files.set(`${VETD}/frames/phone.tsx`, src('{ width: 393, height: 852, title: "P2", radius: 62 }'));
	await session.reconcile();
	expect(session.manifest.frames[0]).toMatchObject({ title: "P2", radius: 30 });

	// agent 改了圆角这一项声明：画布跟着。
	files.set(`${VETD}/frames/phone.tsx`, src('{ width: 393, height: 852, title: "P2", radius: 20 }'));
	await session.reconcile();
	expect(session.manifest.frames[0]?.radius).toBe(20);

	// agent 删掉声明（没意见）：保留现有圆角。
	files.set(`${VETD}/frames/phone.tsx`, src('{ width: 393, height: 852, title: "P2" }'));
	await session.reconcile();
	expect(session.manifest.frames[0]?.radius).toBe(20);
});

it("recovers a manifest whose meta carries junk without trusting it", async () => {
	const manifest = {
		version: 1,
		type: "vetta-design",
		canvas: { x: 0, y: 0, zoom: 1 },
		frames: [
			{
				id: "phone",
				file: "frames/phone.tsx",
				x: 0,
				y: 0,
				width: 393,
				height: 852,
				title: "P",
				meta: { width: 393, height: 852, title: "P", radius: "big", extra: true },
			},
		],
	};
	const { ctx } = memoryCtx({
		[`${VETD}/design.json`]: JSON.stringify(manifest),
		[`${VETD}/frames/phone.tsx`]: src('{ width: 393, height: 852, title: "P" }'),
	});
	const session = new DesignSession(ctx, VETD);
	await session.open();
	expect(session.manifest.frames[0]?.meta).toEqual({ width: 393, height: 852, title: "P" });
});
