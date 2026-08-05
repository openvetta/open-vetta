import type { ConversationDocument } from "@vetta/runtime-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { readCodingAgentLegacySessionDocument } from "../../adapters/runtime-core/legacy-session-format/document.js";
import { APP_NAME, getExportTemplateDir } from "../../config.js";
import { getResolvedThemeColors, getThemeExportColors } from "../../modes/interactive/theme/theme.js";
import { CODING_AGENT_SESSION_VIEW_VERSION, type CodingAgentSessionEntry } from "../../sessions/index.js";

/**
 * Interface for rendering custom tools to HTML.
 * Used by agent-session to pre-render extension tool output.
 */
export interface ToolHtmlRenderer {
	/** Render a tool call to HTML. Returns undefined if tool has no custom renderer. */
	renderCall(toolName: string, args: unknown): string | undefined;
	/** Render a tool result to HTML. Returns undefined if tool has no custom renderer. */
	renderResult(
		toolName: string,
		result: Array<{ type: string; text?: string; data?: string; mimeType?: string }>,
		details: unknown,
		isError: boolean,
	): string | undefined;
}

/** Pre-rendered HTML for a custom tool call and result */
interface RenderedToolHtml {
	callHtml?: string;
	resultHtml?: string;
}

export interface ExportOptions {
	outputPath?: string;
	themeName?: string;
	/** Optional tool renderer for custom tools */
	toolRenderer?: ToolHtmlRenderer;
	/** Greenfield read model does not carry the last effective prompt or tool catalog. */
	systemPrompt?: string;
	tools?: readonly ExportedToolInfo[];
}

interface ExportedToolInfo {
	readonly name: string;
	readonly description: string;
	readonly parameters: unknown;
}

/** Parse a color string to RGB values. Supports hex (#RRGGBB) and rgb(r,g,b) formats. */
function parseColor(color: string): { r: number; g: number; b: number } | undefined {
	const hexMatch = color.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
	if (hexMatch) {
		return {
			r: Number.parseInt(hexMatch[1], 16),
			g: Number.parseInt(hexMatch[2], 16),
			b: Number.parseInt(hexMatch[3], 16),
		};
	}
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}
	return undefined;
}

/** Calculate relative luminance of a color (0-1, higher = lighter). */
function getLuminance(r: number, g: number, b: number): number {
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Adjust color brightness. Factor > 1 lightens, < 1 darkens. */
function adjustBrightness(color: string, factor: number): string {
	const parsed = parseColor(color);
	if (!parsed) return color;
	const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c * factor)));
	return `rgb(${adjust(parsed.r)}, ${adjust(parsed.g)}, ${adjust(parsed.b)})`;
}

/** Derive export background colors from a base color (e.g., userMessageBg). */
function deriveExportColors(baseColor: string): { pageBg: string; cardBg: string; infoBg: string } {
	const parsed = parseColor(baseColor);
	if (!parsed) {
		return {
			pageBg: "rgb(24, 24, 30)",
			cardBg: "rgb(30, 30, 36)",
			infoBg: "rgb(60, 55, 40)",
		};
	}

	const luminance = getLuminance(parsed.r, parsed.g, parsed.b);
	const isLight = luminance > 0.5;

	if (isLight) {
		return {
			pageBg: adjustBrightness(baseColor, 0.96),
			cardBg: baseColor,
			infoBg: `rgb(${Math.min(255, parsed.r + 10)}, ${Math.min(255, parsed.g + 5)}, ${Math.max(0, parsed.b - 20)})`,
		};
	}
	return {
		pageBg: adjustBrightness(baseColor, 0.7),
		cardBg: adjustBrightness(baseColor, 0.85),
		infoBg: `rgb(${Math.min(255, parsed.r + 20)}, ${Math.min(255, parsed.g + 15)}, ${parsed.b})`,
	};
}

/**
 * Generate CSS custom property declarations from theme colors.
 */
function generateThemeVars(themeName?: string): string {
	const colors = getResolvedThemeColors(themeName);
	const lines: string[] = [];
	for (const [key, value] of Object.entries(colors)) {
		lines.push(`--${key}: ${value};`);
	}

	// Use explicit theme export colors if available, otherwise derive from userMessageBg
	const themeExport = getThemeExportColors(themeName);
	const userMessageBg = colors.userMessageBg || "#343541";
	const derivedColors = deriveExportColors(userMessageBg);

	lines.push(`--exportPageBg: ${themeExport.pageBg ?? derivedColors.pageBg};`);
	lines.push(`--exportCardBg: ${themeExport.cardBg ?? derivedColors.cardBg};`);
	lines.push(`--exportInfoBg: ${themeExport.infoBg ?? derivedColors.infoBg};`);

	return lines.join("\n      ");
}

interface SessionData {
	header: unknown;
	entries: readonly unknown[];
	leafId: string | null;
	systemPrompt?: string;
	tools?: ExportedToolInfo[];
	/** Pre-rendered HTML for custom tool calls/results, keyed by tool call ID */
	renderedTools?: Record<string, RenderedToolHtml>;
}

interface ExportTemplateAssets {
	readonly template: string;
	readonly css: string;
	readonly js: string;
	readonly markedJs: string;
	readonly highlightJs: string;
}

const EXPORT_TEMPLATE_ASSETS_KEY = Symbol.for("@vetta/coding-agent/export-template-assets");

/** Install assets embedded by a standalone executable composition root. */
export function installExportTemplateAssets(assets: ExportTemplateAssets): void {
	Reflect.set(globalThis, EXPORT_TEMPLATE_ASSETS_KEY, assets);
}

function loadExportTemplateAssets(): ExportTemplateAssets {
	const installedAssets = Reflect.get(globalThis, EXPORT_TEMPLATE_ASSETS_KEY);
	if (isExportTemplateAssets(installedAssets)) return installedAssets;
	const templateDir = getExportTemplateDir();
	return {
		template: readFileSync(join(templateDir, "template.html"), "utf-8"),
		css: readFileSync(join(templateDir, "template.css"), "utf-8"),
		js: readFileSync(join(templateDir, "template.js"), "utf-8"),
		markedJs: readFileSync(join(templateDir, "vendor", "marked.min.js"), "utf-8"),
		highlightJs: readFileSync(join(templateDir, "vendor", "highlight.min.js"), "utf-8"),
	};
}

function isExportTemplateAssets(value: unknown): value is ExportTemplateAssets {
	if (typeof value !== "object" || value === null) return false;
	return ["template", "css", "js", "markedJs", "highlightJs"].every(
		(key) => typeof Reflect.get(value, key) === "string",
	);
}

/**
 * Core HTML generation logic shared by both export functions.
 */
function generateHtml(sessionData: SessionData, themeName?: string): string {
	const assets = loadExportTemplateAssets();

	const themeVars = generateThemeVars(themeName);
	const colors = getResolvedThemeColors(themeName);
	const exportColors = deriveExportColors(colors.userMessageBg || "#343541");
	const bodyBg = exportColors.pageBg;
	const containerBg = exportColors.cardBg;
	const infoBg = exportColors.infoBg;

	// Base64 encode session data to avoid escaping issues
	const sessionDataBase64 = Buffer.from(JSON.stringify(sessionData)).toString("base64");

	// Build the CSS with theme variables injected
	const css = assets.css
		.replace("{{THEME_VARS}}", themeVars)
		.replace("{{BODY_BG}}", bodyBg)
		.replace("{{CONTAINER_BG}}", containerBg)
		.replace("{{INFO_BG}}", infoBg);

	return assets.template
		.replace("{{CSS}}", css)
		.replace("{{JS}}", assets.js)
		.replace("{{SESSION_DATA}}", sessionDataBase64)
		.replace("{{MARKED_JS}}", assets.markedJs)
		.replace("{{HIGHLIGHT_JS}}", assets.highlightJs);
}

/** Built-in tool names that have custom rendering in template.js */
const BUILTIN_TOOLS = new Set([
	"bash",
	"read",
	"write",
	"edit",
	"ls",
	"find",
	"grep",
	"dir_tree",
	"tree",
	"kb_write_page",
	"kb_filter_by_tags",
	"kb_list_available_tags",
]);

/**
 * Pre-render custom tools to HTML using their TUI renderers.
 */
function preRenderCustomTools(
	entries: readonly (CodingAgentSessionEntry | ConversationDocumentEntry)[],
	toolRenderer: ToolHtmlRenderer,
): Record<string, RenderedToolHtml> {
	const renderedTools: Record<string, RenderedToolHtml> = {};

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!isRecord(msg)) continue;

		// Find tool calls in assistant messages
		const content = Reflect.get(msg, "content");
		if (Reflect.get(msg, "role") === "assistant" && Array.isArray(content)) {
			for (const block of content) {
				if (!isRecord(block)) continue;
				const toolName = Reflect.get(block, "name");
				const toolCallId = Reflect.get(block, "id");
				if (
					Reflect.get(block, "type") === "toolCall" &&
					typeof toolName === "string" &&
					typeof toolCallId === "string" &&
					!BUILTIN_TOOLS.has(toolName)
				) {
					const callHtml = toolRenderer.renderCall(toolName, Reflect.get(block, "arguments"));
					if (callHtml) {
						renderedTools[toolCallId] = { callHtml };
					}
				}
			}
		}

		// Find tool results
		const toolCallId = Reflect.get(msg, "toolCallId");
		if (Reflect.get(msg, "role") === "toolResult" && typeof toolCallId === "string") {
			const rawToolName = Reflect.get(msg, "toolName");
			const toolName = typeof rawToolName === "string" ? rawToolName : "";
			// Only render if we have a pre-rendered call OR it's not a built-in tool
			const existing = renderedTools[toolCallId];
			if (existing || !BUILTIN_TOOLS.has(toolName)) {
				const resultHtml = toolRenderer.renderResult(
					toolName,
					readRenderableToolResultContent(content),
					Reflect.get(msg, "details"),
					Reflect.get(msg, "isError") === true,
				);
				if (resultHtml) {
					renderedTools[toolCallId] = {
						...existing,
						resultHtml,
					};
				}
			}
		}
	}

	return renderedTools;
}

function readRenderableToolResultContent(
	value: unknown,
): Array<{ type: string; text?: string; data?: string; mimeType?: string }> {
	if (!Array.isArray(value)) return [];
	return value.flatMap((part) => {
		if (!isRecord(part)) return [];
		const type = Reflect.get(part, "type");
		if (typeof type !== "string") return [];
		const text = Reflect.get(part, "text");
		const data = Reflect.get(part, "data");
		const mimeType = Reflect.get(part, "mimeType");
		return [
			{
				type,
				...(typeof text === "string" ? { text } : {}),
				...(typeof data === "string" ? { data } : {}),
				...(typeof mimeType === "string" ? { mimeType } : {}),
			},
		];
	});
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Export a Legacy JSONL session through the isolated read-only format boundary. */
export async function exportFromFile(inputPath: string, options?: ExportOptions | string): Promise<string> {
	const opts: ExportOptions = typeof options === "string" ? { outputPath: options } : options || {};
	if (!existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);
	const document = readCodingAgentLegacySessionDocument(inputPath);
	const sessionData: SessionData = {
		header: document.header,
		entries: document.entries,
		leafId: document.activeLeafId,
	};
	const html = generateHtml(sessionData, opts.themeName);
	const outputPath = opts.outputPath ?? `${APP_NAME}-session-${basename(inputPath, ".jsonl")}.html`;
	writeFileSync(outputPath, html, "utf8");
	return outputPath;
}

/** Export a Greenfield conversation read model without reopening it through Legacy SessionManager. */
export async function exportConversationDocumentToHtml(
	document: ConversationDocument,
	sessionFile: string,
	options?: ExportOptions | string,
): Promise<string> {
	const opts: ExportOptions = typeof options === "string" ? { outputPath: options } : options || {};
	const sessionData: SessionData = {
		header: {
			type: "session",
			version: CODING_AGENT_SESSION_VIEW_VERSION,
			id: document.identity.sessionId,
			timestamp: new Date(document.identity.createdAt).toISOString(),
			cwd: document.identity.cwd,
			parentSession: document.identity.parentSessionPath,
			name: document.name,
		},
		entries: document.entries,
		leafId: document.activeLeafId,
		systemPrompt: opts.systemPrompt,
		tools: opts.tools ? [...opts.tools] : undefined,
		renderedTools: opts.toolRenderer ? preRenderCustomTools(document.entries, opts.toolRenderer) : undefined,
	};
	const html = generateHtml(sessionData, opts.themeName);
	const outputPath = opts.outputPath ?? `${APP_NAME}-session-${basename(sessionFile, ".conversation.jsonl")}.html`;
	writeFileSync(outputPath, html, "utf8");
	return outputPath;
}
