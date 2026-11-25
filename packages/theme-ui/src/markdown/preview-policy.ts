export const MAX_PREVIEW_LENGTH = 256_000;
export const MARKDOWN_PREVIEW_FRAME_NAME = "vetta-markdown-preview";

/** No same-origin, popups, forms, downloads, navigation of ancestors or host bridge. */
export function createPreviewDocument(source: string): string {
	const policy = [
		"default-src 'none'",
		"script-src 'none'",
		"style-src 'unsafe-inline'",
		"img-src data: blob:",
		"font-src data:",
		"connect-src 'none'",
		"frame-src 'none'",
		"worker-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	].join("; ");
	// The trusted outer frame also restricts child navigation. A child's own CSP alone
	// cannot prevent scripts assigning location or a meta refresh from navigating itself.
	const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${source}`;
	const escaped = document
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
	const outerPolicy = policy.replace("frame-src 'none'", "frame-src about:");
	return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${outerPolicy}"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}body{overflow:hidden}</style><iframe title="HTML" sandbox="" referrerpolicy="no-referrer" srcdoc="${escaped}"></iframe>`;
}

export function svgImageSource(source: string): string | null {
	if (source.length > MAX_PREVIEW_LENGTH) return null;
	// SVG image mode disables scripts and external resources, unlike inserting SVG into the host DOM.
	const image = source.replace(/<svg\b([^>]*)>/i, (tag: string, attributes: string) =>
		/\bxmlns\s*=/.test(attributes) ? tag : `<svg xmlns="http://www.w3.org/2000/svg"${attributes}>`,
	);
	try {
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`;
	} catch {
		// A partial UTF-16 pair in a streamed/model-supplied string must not crash the message tree.
		return null;
	}
}

/**
 * Mermaid emits `width="100%"` with no height. As an `<img>`, such an SVG has no intrinsic size,
 * so the browser fits it into the 300×150 default box. Give it the viewBox size instead.
 */
export function withIntrinsicSize(source: string): string {
	return source.replace(/<svg\b([^>]*)>/i, (tag: string, attributes: string) => {
		const width = /\swidth\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1]?.trim();
		if (width && !width.endsWith("%")) return tag;
		const box = /\sviewBox\s*=\s*["']([^"']*)["']/i
			.exec(attributes)?.[1]
			?.trim()
			.split(/[\s,]+/)
			.map(Number);
		const [, , w = 0, h = 0] = box ?? [];
		if (box?.length !== 4 || !(w > 0) || !(h > 0)) return tag;
		const rest = attributes
			.replace(/\s(?:width|height)\s*=\s*(["'])[^"']*\1/gi, "")
			.replace(/max-width\s*:\s*[^;"']*;?\s*/i, "");
		return `<svg${rest} width="${w}" height="${h}">`;
	});
}

/** Paints the SVG root so a diagram stays readable when enlarged, copied or saved onto a dark surface. */
export function withBackground(source: string, color: string): string {
	return source.replace(/<svg\b([^>]*)>/i, (_tag: string, attributes: string) => {
		const style = /\sstyle\s*=\s*(["'])([^"']*)\1/i.exec(attributes);
		if (!style) return `<svg${attributes} style="background-color: ${color};">`;
		const rest = (style[2] ?? "").replace(/background(?:-color)?\s*:\s*[^;]*;?\s*/gi, "").trim();
		const merged = `${rest}${rest && !rest.endsWith(";") ? ";" : ""}${rest ? " " : ""}background-color: ${color};`;
		return `<svg${attributes.replace(style[0], ` style="${merged}"`)}>`;
	});
}
