import type { FilePreviewItem } from "@vetta/theme-ui/file-preview";
import { getExtension } from "@vetta/theme-ui/file-preview";

const TEXT_EXTENSIONS = new Set([
	"md",
	"mdx",
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"json",
	"yaml",
	"yml",
	"toml",
	"xml",
	"html",
	"htm",
	"css",
	"scss",
	"less",
	"py",
	"go",
	"rs",
	"java",
	"kt",
	"swift",
	"rb",
	"php",
	"c",
	"cpp",
	"h",
	"cs",
	"sh",
	"bash",
	"zsh",
	"sql",
	"graphql",
	"gql",
	"lua",
	"r",
	"dart",
	"env",
	"lock",
	"ini",
	"cfg",
	"conf",
	"log",
	"txt",
	"dockerfile",
	"makefile",
]);

const SUPPORTED_EXTENSIONS = new Set<string>([...TEXT_EXTENSIONS]);

export function isPreviewSupported(name: string): boolean {
	return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

export function isTextExtension(ext: string): boolean {
	return TEXT_EXTENSIONS.has(ext);
}

export async function downloadItem(item: FilePreviewItem): Promise<void> {
	if (!item.url) return;
	const response = await fetch(item.url);
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = item.name;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}
