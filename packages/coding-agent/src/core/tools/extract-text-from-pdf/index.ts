import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import { type Static, Type } from "@sinclair/typebox";
import { getVettaHomePath } from "@vetta/action-rpc";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { runWithOcrLimit } from "../ocr-concurrency.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const execFileAsync = promisify(execFile);

const extractTextFromPdfSchema = Type.Object({
	description: toolCallDescriptionSchema,
	input: Type.String({ description: "Path to the source PDF file." }),
	output: Type.Optional(
		Type.String({
			description: "Path to write the full structured JSON. Default: <input>.ocr.json next to the source.",
		}),
	),
	pages: Type.Optional(
		Type.String({
			description: 'Pages to extract: "all" | "N" | "N-M". Default "all".',
		}),
	),
	dpi: Type.Optional(
		Type.Integer({
			description:
				"Render DPI for OCR fallback. 36-600. Default 150. If OCR hits OOM, retry with a smaller DPI. When omitted, the tool may automatically lower DPI for oversized PDF pages.",
			minimum: 36,
			maximum: 600,
		}),
	),
	maxChars: Type.Optional(
		Type.Integer({
			description: "Cap on returned text length. Default 8000. Full text is still written to <output>.",
			minimum: 0,
		}),
	),
	preferTextLayer: Type.Optional(
		Type.Boolean({
			description: "Try the embedded text layer before falling back to OCR. Default true.",
		}),
	),
});

export type ExtractTextFromPdfToolInput = Static<typeof extractTextFromPdfSchema>;

interface DesktopConfigWithAppPath {
	vettaAppPath?: string;
}

interface OcrCliResponse {
	ok: boolean;
	output?: string;
	totalPages?: number;
	processedPages?: number;
	textLayerPages?: number;
	ocrPages?: number;
	engine?: string;
	durationMs?: number;
	error?: { code: string; message: string };
}

interface OcrPageResult {
	page: number;
	text: string;
	source: "text-layer" | "ocr";
	width: number;
	height: number;
	ocrDurationMs?: number;
	confidence?: number;
}

interface OcrJsonDocument {
	version: number;
	meta: Record<string, unknown>;
	pages: OcrPageResult[];
}

interface ExecFileError extends Error {
	stdout?: string;
	stderr?: string;
}

const DEFAULT_MAX_CHARS = 8000;
const DEFAULT_RENDER_DPI = 150;
const MIN_RENDER_DPI = 36;
const MAX_RENDER_DPI = 600;
const MAX_RENDERED_PAGE_EDGE_PX = 10000;
// 30 minutes — large scanned PDFs at 200 DPI run ~1-2s/page on M2; with
// hundreds of pages plus model warm-up the worst case is well under this.
const OCR_TIMEOUT_MS = 30 * 60 * 1000;

function configPath(): string {
	return nodePath.join(getVettaHomePath(), "desktop-config.json");
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		try {
			await access(filePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}
}

async function readConfiguredVettaAppPath(): Promise<string | undefined> {
	try {
		const raw = await readFile(configPath(), "utf8");
		const parsed = JSON.parse(raw) as DesktopConfigWithAppPath;
		return typeof parsed.vettaAppPath === "string" && parsed.vettaAppPath.length > 0
			? parsed.vettaAppPath
			: undefined;
	} catch {
		return undefined;
	}
}

async function findVettaExecutable(): Promise<{ path: string; staleConfiguredPath?: string }> {
	const envPath = process.env.VETTA_DESKTOP_EXE;
	if (envPath && (await fileExists(envPath))) {
		return { path: envPath };
	}

	const configuredPath = await readConfiguredVettaAppPath();
	if (configuredPath && (await fileExists(configuredPath))) {
		return { path: configuredPath };
	}

	const candidates =
		process.platform === "win32"
			? [
					nodePath.join(process.env.LOCALAPPDATA ?? "", "Programs", "Vetta", "Vetta.exe"),
					nodePath.join(process.env.ProgramFiles ?? "C:\\Program Files", "Vetta", "Vetta.exe"),
				]
			: ["/Applications/Vetta.app/Contents/MacOS/Vetta", "/usr/local/bin/vetta-desktop"];

	for (const candidate of candidates) {
		if (candidate && (await fileExists(candidate))) {
			return { path: candidate, staleConfiguredPath: configuredPath };
		}
	}

	const staleNote = configuredPath ? ` Configured vettaAppPath is stale: ${configuredPath}` : "";
	throw new Error(
		`Vetta Desktop executable not found. Set VETTA_DESKTOP_EXE or start Vetta Desktop once to write vettaAppPath.${staleNote}`,
	);
}

function parseDesktopResponse(stdout: string): OcrCliResponse {
	// Vetta Desktop's CLI mode emits a single JSON object on stdout, but the
	// surrounding Electron stack occasionally prints other lines (e.g. helper
	// warnings) ahead of it. We pick the LAST non-empty line that parses as
	// JSON to be robust against that noise.
	const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			const parsed = JSON.parse(lines[i]) as OcrCliResponse;
			if (typeof parsed.ok === "boolean") return parsed;
		} catch {
			// keep walking back
		}
	}
	throw new Error("Vetta Desktop returned no parseable JSON on stdout");
}

function defaultOutputPath(input: string): string {
	return `${input}.ocr.json`;
}

interface PdfPageRange {
	first?: number;
	last?: number;
}

interface PdfPageSize {
	widthPts: number;
	heightPts: number;
}

function clampDpi(dpi: number): number {
	return Math.min(MAX_RENDER_DPI, Math.max(MIN_RENDER_DPI, Math.floor(dpi)));
}

function parsePageRange(pages: string | undefined): PdfPageRange {
	if (!pages || pages === "all") return {};

	const single = /^(\d+)$/.exec(pages);
	if (single) {
		const page = Number(single[1]);
		return { first: page, last: page };
	}

	const range = /^(\d+)-(\d+)$/.exec(pages);
	if (range) {
		const first = Number(range[1]);
		const last = Number(range[2]);
		return first <= last ? { first, last } : {};
	}

	return {};
}

function parsePdfInfoPageSizes(stdout: string): PdfPageSize[] {
	const sizes: PdfPageSize[] = [];
	const pattern = /Page(?:\s+\d+)?\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gi;
	for (const match of stdout.matchAll(pattern)) {
		const widthPts = Number(match[1]);
		const heightPts = Number(match[2]);
		if (Number.isFinite(widthPts) && Number.isFinite(heightPts) && widthPts > 0 && heightPts > 0) {
			sizes.push({ widthPts, heightPts });
		}
	}
	return sizes;
}

async function readPdfPageSizes(inputPath: string, pages: string | undefined): Promise<PdfPageSize[]> {
	const range = parsePageRange(pages);
	const args = ["-box"];
	if (range.first !== undefined) args.push("-f", String(range.first));
	if (range.last !== undefined) args.push("-l", String(range.last));
	args.push(inputPath);

	try {
		const { stdout } = await execFileAsync("pdfinfo", args, {
			encoding: "utf8",
			timeout: 30 * 1000,
			maxBuffer: 4 * 1024 * 1024,
			windowsHide: true,
		});
		return parsePdfInfoPageSizes(stdout);
	} catch {
		return [];
	}
}

async function resolveRenderDpi(
	inputPath: string,
	pages: string | undefined,
	requestedDpi: number | undefined,
): Promise<number> {
	if (requestedDpi !== undefined) return clampDpi(requestedDpi);

	const pageSizes = await readPdfPageSizes(inputPath, pages);
	const maxPageEdgePts = Math.max(0, ...pageSizes.map((size) => Math.max(size.widthPts, size.heightPts)));
	if (maxPageEdgePts <= 0) return DEFAULT_RENDER_DPI;

	const maxSafeDpi = Math.floor((MAX_RENDERED_PAGE_EDGE_PX * 72) / maxPageEdgePts);
	return clampDpi(Math.min(DEFAULT_RENDER_DPI, maxSafeDpi));
}

function formatPageBlock(p: OcrPageResult): string {
	return `=== Page ${p.page} (${p.source}${p.confidence !== undefined ? `, conf ${p.confidence}` : ""}) ===\n${p.text}`;
}

function buildAgentText(doc: OcrJsonDocument, maxChars: number, outputPath: string): string {
	const blocks = doc.pages.map(formatPageBlock);
	const full = blocks.join("\n\n");
	const truncated = maxChars > 0 && full.length > maxChars;
	const body = truncated ? `${full.slice(0, maxChars)}\n…[truncated ${full.length - maxChars} chars]` : full;

	const meta = doc.meta as {
		totalPages?: number;
		processedPages?: number;
		textLayerPages?: number;
		ocrPages?: number;
		durationMs?: number;
		engine?: string;
	};
	const footer = [
		"---",
		`total_pages=${meta.totalPages ?? "?"} processed=${meta.processedPages ?? "?"} ` +
			`text_layer=${meta.textLayerPages ?? 0} ocr=${meta.ocrPages ?? 0} ` +
			`duration_ms=${meta.durationMs ?? "?"} engine=${meta.engine ?? "?"}`,
		`output: ${outputPath}`,
	].join("\n");

	return `${body}\n${footer}`;
}

export function createExtractTextFromPdfTool(cwd: string): CodingAgentTool<typeof extractTextFromPdfSchema> {
	const fallback = "Extract text from a PDF (scanned or born-digital) via Vetta Desktop's local OCR runner.";
	const description = loadToolDescription(import.meta.url, fallback);

	return {
		name: "extract_text_from_pdf",
		label: "extract_text_from_pdf",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "doc",
		description,
		parameters: extractTextFromPdfSchema,
		execute: async (
			_toolCallId,
			{ input, output, pages, dpi, maxChars, preferTextLayer },
			signal,
			_onUpdate,
			ctx,
		) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			ctx?.phase("locate");
			const inputPath = resolveExistingPath(input, cwd);
			const outputPath = resolveToCwd(output ?? defaultOutputPath(inputPath), cwd);
			const vetta = await findVettaExecutable();
			const renderDpi = await resolveRenderDpi(inputPath, pages, dpi);

			const args = ["--ocr-pdf", inputPath, "--output", outputPath];
			if (pages) args.push("--pages", pages);
			args.push("--dpi", String(renderDpi));
			if (preferTextLayer === false) args.push("--no-text-layer");

			ctx?.phase("ocr");
			// 全局 OCR 并发闸：限制同时存在的本地 Vetta OCR 子进程数，保护 CPU。
			const { stdout, stderr } = await runWithOcrLimit(async () => {
				// 已拿到并发额度后再 spawn；若此刻已 abort 则立即短路，不占额度空跑 OCR。
				if (signal?.aborted) throw new Error("Operation aborted");
				const child = execFileAsync(vetta.path, args, {
					encoding: "utf8",
					timeout: OCR_TIMEOUT_MS,
					maxBuffer: 32 * 1024 * 1024,
					windowsHide: true,
				});
				const onAbort = (): void => {
					// execFileAsync hides the child handle; rely on timeout for cleanup.
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				try {
					const result = await child;
					return { stdout: result.stdout, stderr: result.stderr };
				} catch (error) {
					const execError = error as ExecFileError;
					return { stdout: execError.stdout ?? "", stderr: execError.stderr ?? execError.message };
				} finally {
					signal?.removeEventListener("abort", onAbort);
				}
			});
			if (signal?.aborted) throw new Error("Operation aborted");

			const response = parseDesktopResponse(stdout);
			if (!response.ok) {
				const message = response.error?.message ?? (stderr.trim() || "Unknown OCR error");
				throw new Error(`Vetta Desktop OCR failed: ${message}`);
			}
			if (!response.output) {
				throw new Error("Vetta Desktop did not return an output path");
			}

			ctx?.phase("read");
			const docRaw = await readFile(response.output, "utf8");
			const doc = JSON.parse(docRaw) as OcrJsonDocument;
			const cap = maxChars ?? DEFAULT_MAX_CHARS;
			const text = buildAgentText(doc, cap, response.output);
			const staleNote = vetta.staleConfiguredPath
				? `\nNote: configured vettaAppPath was stale and a fallback path was used: ${vetta.staleConfiguredPath}`
				: "";
			return {
				content: [{ type: "text", text: `${text}${staleNote}` }],
				details: undefined,
			};
		},
	};
}

export const extractTextFromPdfTool = createExtractTextFromPdfTool(process.cwd());
