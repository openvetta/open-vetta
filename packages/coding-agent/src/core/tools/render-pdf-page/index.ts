import { execFile } from "node:child_process";
import { mkdir, stat, unlink } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";

const execFileAsync = promisify(execFile);

const renderPdfPageSchema = Type.Object({
	input: Type.String({ description: "Path to the source PDF file." }),
	page: Type.Integer({
		description: "1-based page number to render. Single page only.",
		minimum: 1,
	}),
	output: Type.Optional(
		Type.String({
			description: "Path to write the PNG. Default: <input>.p<page>.png next to the source.",
		}),
	),
	dpi: Type.Optional(
		Type.Integer({
			description: "Render DPI. 72-600. Default 200.",
			minimum: 72,
			maximum: 600,
		}),
	),
});

export type RenderPdfPageToolInput = Static<typeof renderPdfPageSchema>;

interface ExecFileError extends Error {
	stdout?: string;
	stderr?: string;
}

const DEFAULT_DPI = 200;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

function defaultOutputPath(input: string, page: number): string {
	return `${input}.p${page}.png`;
}

function stripPngExt(p: string): string {
	return p.toLowerCase().endsWith(".png") ? p.slice(0, -4) : p;
}

export function createRenderPdfPageTool(cwd: string): AgentTool<typeof renderPdfPageSchema> {
	const fallback =
		"Render a single PDF page to a PNG image for visual inspection. Follow up with `read` on the returned path.";
	const description = loadToolDescription(import.meta.url, fallback);

	return {
		name: "render_pdf_page",
		label: "render_pdf_page",
		description,
		parameters: renderPdfPageSchema,
		execute: async (_toolCallId, { input, page, output, dpi }, signal, _onUpdate, ctx) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			ctx?.phase("locate");
			const inputPath = resolveExistingPath(input, cwd);
			const outputPath = resolveToCwd(output ?? defaultOutputPath(inputPath, page), cwd);
			if (!outputPath.toLowerCase().endsWith(".png")) {
				throw new Error(`output must end in .png (got "${outputPath}")`);
			}
			await mkdir(nodePath.dirname(outputPath), { recursive: true });

			const renderDpi = dpi ?? DEFAULT_DPI;
			const prefix = stripPngExt(outputPath);

			ctx?.phase("render");
			const startedAt = Date.now();
			try {
				await execFileAsync(
					"pdftoppm",
					[
						"-png",
						"-r",
						String(renderDpi),
						"-f",
						String(page),
						"-l",
						String(page),
						"-singlefile",
						inputPath,
						prefix,
					],
					{
						encoding: "utf8",
						timeout: RENDER_TIMEOUT_MS,
						maxBuffer: 4 * 1024 * 1024,
						windowsHide: true,
					},
				);
			} catch (error) {
				const execError = error as ExecFileError;
				const stderr = (execError.stderr ?? "").trim();
				const hint = execError.message.includes("ENOENT")
					? " (pdftoppm not found — install poppler: `brew install poppler` on macOS)"
					: "";
				throw new Error(`pdftoppm failed: ${stderr || execError.message}${hint}`);
			}
			if (signal?.aborted) {
				await unlink(outputPath).catch(() => {});
				throw new Error("Operation aborted");
			}

			let sizeBytes: number | undefined;
			try {
				const st = await stat(outputPath);
				sizeBytes = st.size;
			} catch {
				throw new Error(`pdftoppm did not produce expected output at ${outputPath}`);
			}
			const durationMs = Date.now() - startedAt;

			const text = [
				`Rendered page ${page} of ${inputPath} at ${renderDpi} dpi.`,
				`Next step: call read("${outputPath}") to load the image for visual analysis.`,
				"---",
				`dpi=${renderDpi} size_bytes=${sizeBytes ?? "?"} duration_ms=${durationMs}`,
				`output: ${outputPath}`,
			].join("\n");

			return {
				content: [{ type: "text", text }],
				details: undefined,
			};
		},
	};
}

export const renderPdfPageTool = createRenderPdfPageTool(process.cwd());
