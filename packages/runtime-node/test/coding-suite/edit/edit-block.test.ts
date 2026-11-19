import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createEditTool, type EditToolDetails, type EditToolInput } from "../../../src/coding/index.js";

describe("edit tool block mode", () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "vetta-edit-block-"));
		file = join(dir, "sample.ts");
		writeFileSync(file, ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;"].join("\n"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const tool = () => {
		const runtimeTool = createEditTool(dir, {
			pathPolicy: { getRejectionReason: () => undefined },
		});
		return {
			execute(toolCallId: string, input: EditToolInput) {
				return runtimeTool.execute({
					sessionId: "test-session",
					turnId: "test-turn",
					toolCallId,
					input,
					signal: new AbortController().signal,
				});
			},
		};
	};

	const textOf = (result: Awaited<ReturnType<ReturnType<typeof tool>["execute"]>>): string =>
		result.content[0].type === "text" ? result.content[0].text : "";

	const failureOf = async (input: EditToolInput): Promise<string> => {
		try {
			await tool().execute("t", input);
			return "";
		} catch (error: unknown) {
			return String(error);
		}
	};

	test("replaces one line located by its content", async () => {
		const result = await tool().execute("t", {
			path: file,
			edits: [{ oldText: "const b = 2;", newText: "const b = 20;" }],
		});
		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("const b = 20;");
		expect((result.details as EditToolDetails).appliedEdits).toBe(1);
		expect(textOf(result)).toContain("Current lines around the changes");
	});

	test("matches despite different indentation and internal spacing", async () => {
		writeFileSync(file, ["function value() {", "    return  compute();", "}"].join("\n"));

		await tool().execute("t", {
			path: file,
			edits: [{ oldText: "return compute();", newText: "  return compute(2);" }],
		});

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("  return compute(2);");
	});

	test("replaces a whole line when oldText is only a fragment of it", async () => {
		// Documented rule: block mode is line granular — the fragment locates the line, newText
		// replaces that entire line.
		await tool().execute("t", {
			path: file,
			edits: [{ oldText: "b = 2", newText: "const b = 22;" }],
		});

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("const b = 22;");
	});

	test("replaces a long region from its first and last line only", async () => {
		file = join(dir, "sample.tsx");
		writeFileSync(
			file,
			[
				"export const Card = () => (",
				'  <section className="outer">',
				"    <Avatar />",
				"    <p>a</p>",
				"    <p>b</p>",
				"  </section>",
				");",
			].join("\n"),
		);

		await tool().execute("t", {
			path: file,
			edits: [
				{
					oldText: '<section className="outer">',
					oldEndText: "</section>",
					newText: ['  <section className="inner">', "    <Avatar />", "    <p>b</p>", "  </section>"].join("\n"),
				},
			],
		});

		expect(readFileSync(file, "utf-8")).toBe(
			[
				"export const Card = () => (",
				'  <section className="inner">',
				"    <Avatar />",
				"    <p>b</p>",
				"  </section>",
				");",
			].join("\n"),
		);
	});

	test("empty newText deletes the located lines", async () => {
		await tool().execute("t", {
			path: file,
			edits: [{ oldText: "const b = 2;", oldEndText: "const d = 4;", newText: "" }],
		});

		expect(readFileSync(file, "utf-8")).toBe("const a = 1;\nconst e = 5;");
	});

	test("applies several blocks atomically", async () => {
		const result = await tool().execute("t", {
			path: file,
			edits: [
				{ oldText: "const a = 1;", newText: "const a = 10;\nconst added = 11;" },
				{ oldText: "const e = 5;", newText: "const e = 50;" },
			],
		});

		expect(readFileSync(file, "utf-8")).toBe(
			["const a = 10;", "const added = 11;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 50;"].join(
				"\n",
			),
		);
		expect((result.details as EditToolDetails).appliedEdits).toBe(2);
	});

	test("rejects the WHOLE batch when one block cannot be located", async () => {
		const failure = await failureOf({
			path: file,
			edits: [
				{ oldText: "const a = 1;", newText: "const a = 10;" },
				{ oldText: "const nope = 9;", newText: "x" },
			],
		});

		expect(failure).toContain("1 of 2 block(s) could not be located");
		expect(failure).toContain("edits[1].oldText was not found");
		// Atomicity: the good block was not applied either.
		expect(readFileSync(file, "utf-8").split("\n")[0]).toBe("const a = 1;");
	});

	test("a repeated line is rejected with the candidate lines instead of a guess", async () => {
		// The failure mode that made content hashes unusable: `</div>` and blank lines repeat. Here the
		// line number is never used as identity, so ambiguity is reported rather than silently resolved.
		file = join(dir, "sample.tsx");
		writeFileSync(file, ["<div>", "  <span>a</span>", "</div>", "<div>", "  <span>b</span>", "</div>"].join("\n"));

		const failure = await failureOf({
			path: file,
			edits: [{ oldText: "</div>", newText: "</section>" }],
		});

		expect(failure).toContain("matches 2 different places");
		expect(failure).toContain("lines 3, 6");
		expect(failure).toContain("Add a neighbouring line");
		expect(readFileSync(file, "utf-8").split("\n")[2]).toBe("</div>");
	});

	test("adding the neighbouring line makes the same edit unique", async () => {
		file = join(dir, "sample.tsx");
		writeFileSync(file, ["<div>", "  <span>a</span>", "</div>", "<div>", "  <span>b</span>", "</div>"].join("\n"));

		await tool().execute("t", {
			path: file,
			edits: [{ oldText: "<span>b</span>\n</div>", newText: "  <span>B</span>\n</div>" }],
		});

		const written = readFileSync(file, "utf-8").split("\n");
		expect(written[4]).toBe("  <span>B</span>");
		expect(written[5]).toBe("</div>");
	});

	test("strips line numbers the model copied out of read output", async () => {
		const result = await tool().execute("t", {
			path: file,
			edits: [{ oldText: "const b = 2;", newText: "2:const b = 20;" }],
		});

		const written = readFileSync(file, "utf-8");
		expect(written.split("\n")[1]).toBe("const b = 20;");
		expect(written).not.toContain("2:const");
		expect(textOf(result)).toContain("leaked line-number prefix");
	});

	test("keeps a number that is genuine content", async () => {
		await tool().execute("t", {
			path: file,
			edits: [{ oldText: "const b = 2;", newText: "const b = 2; // see 12:30" }],
		});

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("const b = 2; // see 12:30");
	});

	test("rejects overlapping blocks", async () => {
		const failure = await failureOf({
			path: file,
			edits: [
				{ oldText: "const b = 2;", oldEndText: "const d = 4;", newText: "x" },
				{ oldText: "const c = 3;", newText: "y" },
			],
		});

		expect(failure).toContain("overlap");
	});

	test("rejects a replacement identical to the replaced text", async () => {
		const failure = await failureOf({
			path: file,
			edits: [{ oldText: "const c = 3;", newText: "const c = 3;" }],
		});

		expect(failure).toContain("identical to the text it replaces");
	});

	test("mode exclusivity and missing payload", async () => {
		expect(await failureOf({ path: file, oldText: "const a = 1;", newText: "x", edits: [] })).toContain("not both");
		expect(await failureOf({ path: file })).toContain("Missing edit payload");
		expect(await failureOf({ path: file, edits: [] })).toContain("edits array is empty");
	});

	test("preserves CRLF line endings", async () => {
		writeFileSync(file, "a\r\nb\r\nc");
		await tool().execute("t", { path: file, edits: [{ oldText: "b", newText: "B" }] });
		expect(readFileSync(file, "utf-8")).toBe("a\r\nB\r\nc");
	});

	test("reports the current numbered lines around each change", async () => {
		const result = await tool().execute("t", {
			path: file,
			edits: [{ oldText: "const c = 3;", newText: "const c = 30;" }],
		});
		const text = textOf(result);
		expect(text).toContain("2:const b = 2;");
		expect(text).toContain("3:const c = 30;");
		expect(text).toContain("4:const d = 4;");
	});
});

describe("edit tool structural regression guard", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "vetta-edit-structure-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const tool = () =>
		createEditTool(dir, {
			pathPolicy: { getRejectionReason: () => undefined },
		});

	const run = (input: EditToolInput) =>
		tool().execute({
			sessionId: "s",
			turnId: "t",
			toolCallId: "c",
			input,
			signal: new AbortController().signal,
		});

	const failureOf = async (input: EditToolInput): Promise<string> => {
		try {
			await run(input);
			return "";
		} catch (error: unknown) {
			return String(error);
		}
	};

	test("rejects a replacement that drops a JSX closing tag", async () => {
		const file = join(dir, "sample.tsx");
		const source = ["export const Card = () => (", "  <section>ok</section>", "  <aside>", "  </aside>", ");"].join(
			"\n",
		);
		writeFileSync(file, source);

		const failure = await failureOf({
			path: file,
			edits: [{ oldText: "  <aside>", oldEndText: "  </aside>", newText: "  <aside>" }],
		});

		expect(failure).toContain("structurally broken");
		expect(failure).toContain("<aside>");
		expect(readFileSync(file, "utf-8")).toBe(source);
	});

	test("rejects a replacement that drops a brace", async () => {
		const file = join(dir, "sample.ts");
		const source = ["export function value() {", "  return 1;", "}"].join("\n");
		writeFileSync(file, source);

		// Removing only the closer leaves the opener dangling — that is the regression.
		const failure = await failureOf({
			path: file,
			edits: [{ oldText: "return 1;", oldEndText: "}", newText: "  return 1;" }],
		});

		expect(failure).toContain("structurally broken");
		expect(readFileSync(file, "utf-8")).toBe(source);
	});

	test("allows a balanced replacement of a whole block", async () => {
		const file = join(dir, "sample.tsx");
		writeFileSync(file, ["export const Card = () => (", "  <section>ok</section>", ");"].join("\n"));

		await run({
			path: file,
			edits: [{ oldText: "<section>ok</section>", newText: "<article>ok</article>" }],
		});

		expect(readFileSync(file, "utf-8")).toContain("<article>ok</article>");
	});

	test("allows merging nested elements — the result is still balanced", async () => {
		// The false rejection that the old range-based guard produced: the replaced range ended
		// mid-element, so requiring newText to be self-closing was wrong.
		const file = join(dir, "sample.tsx");
		writeFileSync(
			file,
			[
				"export const Card = () => (",
				'  <div className="outer">',
				'    <div className="a">',
				"    </div>",
				"  </div>",
				");",
			].join("\n"),
		);

		await run({
			path: file,
			edits: [{ oldText: '<div className="a">', oldEndText: "</div>", newText: "<p>a</p>" }],
		});

		expect(readFileSync(file, "utf-8")).toBe(
			["export const Card = () => (", '  <div className="outer">', "<p>a</p>", "  </div>", ");"].join("\n"),
		);
	});

	test("allows editing a file that was already unbalanced in the same way", async () => {
		// The guard is comparative: it never demands a well-formed file, only that the edit does not
		// make things worse. Here a stray `{` was already there before the edit.
		const file = join(dir, "sample.ts");
		writeFileSync(file, ["export function broken() {", "  const a = 1;", "  // trailing comment"].join("\n"));

		await run({ path: file, edits: [{ oldText: "const a = 1;", newText: "  const a = 2;" }] });

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("  const a = 2;");
	});

	test("does not apply the brace rule to prose", async () => {
		const file = join(dir, "notes.md");
		writeFileSync(file, ["Use { as the opening brace.", "It is fine unbalanced here."].join("\n"));

		await run({ path: file, edits: [{ oldText: "It is fine unbalanced here.", newText: "Add { one more." }] });

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("Add { one more.");
	});

	test("does not mistake a TypeScript generic for a JSX element", async () => {
		const file = join(dir, "sample.ts");
		writeFileSync(file, ["const map = new Map<string, Array<number>>();", "export const x = 1;"].join("\n"));

		await run({
			path: file,
			edits: [{ oldText: "export const x = 1;", newText: "export const x: Array<number> = [1];" }],
		});

		expect(readFileSync(file, "utf-8").split("\n")[1]).toBe("export const x: Array<number> = [1];");
	});

	test("applies to exact-text mode too", async () => {
		const file = join(dir, "sample.ts");
		writeFileSync(file, ["export function value() {", "  return 1;", "}"].join("\n"));

		const failure = await failureOf({
			path: file,
			oldText: "export function value() {",
			newText: "export function value() }}",
		});

		expect(failure).not.toBe("");
		expect(readFileSync(file, "utf-8").split("\n")[0]).toBe("export function value() {");
	});
});

describe("edit tool exact-text mode", () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "vetta-edit-exact-"));
		file = join(dir, "sample.ts");
		writeFileSync(
			file,
			["const a = 1;", "", "  splitMembers: function (names) {", "    return [];", "  },"].join("\n"),
		);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const run = (input: EditToolInput) =>
		createEditTool(dir, { pathPolicy: { getRejectionReason: () => undefined } }).execute({
			sessionId: "s",
			turnId: "t",
			toolCallId: "c",
			input,
			signal: new AbortController().signal,
		});

	test("replaces a substring and returns a diff", async () => {
		const result = await run({
			path: file,
			oldText: "splitMembers: function (names)",
			newText: "splitMembers: function (names, sep)",
		});
		expect(readFileSync(file, "utf-8").split("\n")[2]).toContain("function (names, sep)");
		expect((result.details as EditToolDetails).diff).toContain("sep");
	});

	test("strips a leaked line number from the replacement", async () => {
		const result = await run({ path: file, oldText: "const a = 1;", newText: "1:const a = 10;" });
		expect(readFileSync(file, "utf-8").split("\n")[0]).toBe("const a = 10;");
		expect(result.content[0].type === "text" && result.content[0].text).toContain("leaked line-number prefix");
	});

	test("tolerates curly quotes and trailing whitespace in oldText", async () => {
		writeFileSync(file, ['const label = "it\'s fine";'].join("\n"));
		await run({ path: file, oldText: 'const label = "it\u2019s fine";   ', newText: 'const label = "ok";' });
		expect(readFileSync(file, "utf-8")).toBe('const label = "ok";');
	});

	test("rejects non-unique oldText", async () => {
		writeFileSync(file, ["same();", "same();"].join("\n"));
		await expect(run({ path: file, oldText: "same();", newText: "other();" })).rejects.toThrow(/must be unique/);
	});
});
