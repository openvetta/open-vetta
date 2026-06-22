function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function collectStyleSheetText(): string {
	const chunks: string[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			for (const rule of Array.from(sheet.cssRules)) {
				chunks.push(rule.cssText);
			}
		} catch {
			// Desktop styles are local. Optional inaccessible stylesheets keep
			// their browser fallback instead of blocking the whole export.
		}
	}
	return chunks.join("\n");
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
		reader.readAsDataURL(blob);
	});
}

async function inlineImages(source: HTMLElement, clone: HTMLElement): Promise<void> {
	const sourceImages = Array.from(source.querySelectorAll("img"));
	const clonedImages = Array.from(clone.querySelectorAll("img"));
	await Promise.all(
		sourceImages.map(async (image, index) => {
			const clonedImage = clonedImages[index];
			if (!clonedImage) return;
			const src = image.currentSrc || image.src;
			if (!src || src.startsWith("data:")) return;
			try {
				const response = await fetch(src);
				if (!response.ok) return;
				clonedImage.src = await blobToDataUrl(await response.blob());
				clonedImage.removeAttribute("srcset");
			} catch {
				// Plugin/external images that cannot be read keep their original
				// URL. Core chat images are already data URLs.
			}
		}),
	);
}

function sanitizeSerializedTree(root: HTMLElement): void {
	for (const script of Array.from(root.querySelectorAll("script"))) {
		script.remove();
	}
	for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
		for (const attribute of Array.from(element.attributes)) {
			if (attribute.name.toLowerCase().startsWith("on")) {
				element.removeAttribute(attribute.name);
			}
		}
		if (element instanceof HTMLAnchorElement && element.href.toLowerCase().startsWith("javascript:")) {
			element.removeAttribute("href");
		}
	}
}

const EXPORT_SCRIPT = `
document.addEventListener("click", function (event) {
	const button = event.target instanceof Element ? event.target.closest("[data-export-toggle]") : null;
	if (!(button instanceof HTMLElement)) return;
	const targetId = button.dataset.exportToggle;
	if (!targetId) return;
	const panel = document.getElementById(targetId);
	if (!panel) return;
	const expanded = panel.hidden;
	panel.hidden = !expanded;
	button.setAttribute("aria-expanded", String(expanded));
	const icon = button.querySelector('[class*="chevron-right"]');
	if (icon) icon.classList.toggle("rotate-90", expanded);
	const label = button.querySelector("[data-export-toggle-label]");
	if (label) {
		label.textContent = expanded
			? button.dataset.exportLabelExpanded || label.textContent
			: button.dataset.exportLabelCollapsed || label.textContent;
	}
});
`;

export async function buildChatHtmlDocument(root: HTMLElement, title: string): Promise<string> {
	const clone = root.cloneNode(true) as HTMLElement;
	await inlineImages(root, clone);
	sanitizeSerializedTree(clone);

	const styleText = collectStyleSheetText().replaceAll("</style", "<\\/style");
	const colorScheme = getComputedStyle(document.documentElement).colorScheme;

	return `<!doctype html>
<html lang="zh-CN" class="${escapeHtml(document.documentElement.className)}" style="${escapeHtml(document.documentElement.getAttribute("style") ?? "")}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
	<title>${escapeHtml(title)}</title>
	<style>
		${styleText}
		:root { color-scheme: ${escapeHtml(colorScheme || "light dark")}; }
		html, body { min-height: 100%; }
		body { margin: 0; background: var(--background); color: var(--foreground); }
		[data-export-collapse-panel][hidden] { display: none !important; }
		.chat-export-document { min-height: 100vh; }
	</style>
</head>
<body class="${escapeHtml(document.body.className)}" style="${escapeHtml(document.body.getAttribute("style") ?? "")}">
	${clone.outerHTML}
	<script>${EXPORT_SCRIPT}</script>
</body>
</html>`;
}
