import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import nodePath from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";

const execFileAsync = promisify(execFile);

const extractTextFromPdfSchema = Type.Object({
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
			description: "Render DPI for OCR fallback. 72-600. Default 200.",
			minimum: 72,
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
// 30 minutes — large scanned PDFs at 200 DPI run ~1-2s/page on M2; with
// hundreds of pages plus model warm-up the worst case is well under this.
const OCR_TIMEOUT_MS = 30 * 60 * 1000;

function configPath(): string {
	return nodePath.join(homedir(), ".vetta", "desktop-config.json");
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

export function createExtractTextFromPdfTool(cwd: string): AgentTool<typeof extractTextFromPdfSchema> {
	const fallback = "Extract text from a PDF (scanned or born-digital) via Vetta Desktop's local OCR runner.";
	const description = loadToolDescription(import.meta.url, fallback);

	return {
		name: "extract_text_from_pdf",
		label: "extract_text_from_pdf",
		description,
		parameters: extractTextFromPdfSchema,
		execute: async (
			_toolCallId: string,
			{ input, output, pages, dpi, maxChars, preferTextLayer }: ExtractTextFromPdfToolInput,
			signal?: AbortSignal,
		) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			const inputPath = resolveExistingPath(input, cwd);
			const outputPath = resolveToCwd(output ?? defaultOutputPath(inputPath), cwd);
			const vetta = await findVettaExecutable();

			const args = ["--ocr-pdf", inputPath, "--output", outputPath];
			if (pages) args.push("--pages", pages);
			if (dpi !== undefined) args.push("--dpi", String(dpi));
			if (preferTextLayer === false) args.push("--no-text-layer");

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
				let stdout: string;
				let stderr: string;
				try {
					const result = await child;
					stdout = result.stdout;
					stderr = result.stderr;
				} catch (error) {
					const execError = error as ExecFileError;
					stdout = execError.stdout ?? "";
					stderr = execError.stderr ?? execError.message;
				}
				if (signal?.aborted) throw new Error("Operation aborted");

				const response = parseDesktopResponse(stdout);
				if (!response.ok) {
					const message = response.error?.message ?? (stderr.trim() || "Unknown OCR error");
					throw new Error(`Vetta Desktop OCR failed: ${message}`);
				}
				if (!response.output) {
					throw new Error("Vetta Desktop did not return an output path");
				}

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
			} finally {
				signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

export const extractTextFromPdfTool = createExtractTextFromPdfTool(process.cwd());
