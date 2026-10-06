const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_DEPTH = 128;

// The sandbox must also remain scriptless: CSP does not prevent a script from
// navigating its own frame to a new document without this document's policy.
const PREVIEW_CSP = [
	"default-src 'none'",
	"script-src 'none'",
	"connect-src 'none'",
	"font-src 'none'",
	"media-src 'none'",
	"object-src 'none'",
	"frame-src 'none'",
	"child-src 'none'",
	"worker-src 'none'",
	"manifest-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"style-src 'unsafe-inline'",
	"img-src data:",
].join("; ");

const HTML_TAGS = new Set([
	"a",
	"abbr",
	"address",
	"article",
	"aside",
	"b",
	"bdi",
	"bdo",
	"blockquote",
	"br",
	"button",
	"caption",
	"cite",
	"code",
	"col",
	"colgroup",
	"data",
	"datalist",
	"dd",
	"del",
	"details",
	"dfn",
	"div",
	"dl",
	"dt",
	"em",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hgroup",
	"hr",
	"i",
	"img",
	"input",
	"ins",
	"kbd",
	"label",
	"legend",
	"li",
	"main",
	"mark",
	"menu",
	"meter",
	"nav",
	"ol",
	"optgroup",
	"option",
	"output",
	"p",
	"pre",
	"progress",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"section",
	"select",
	"small",
	"span",
	"strong",
	"style",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"time",
	"title",
	"tr",
	"u",
	"ul",
	"var",
	"wbr",
]);
const DROP_SUBTREE = new Set([
	"applet",
	"audio",
	"base",
	"embed",
	"frame",
	"frameset",
	"iframe",
	"link",
	"math",
	"meta",
	"noscript",
	"object",
	"plaintext",
	"script",
	"source",
	"template",
	"track",
	"video",
	"xmp",
]);
const SVG_TAGS = new Set([
	"svg",
	"g",
	"path",
	"circle",
	"ellipse",
	"line",
	"polyline",
	"polygon",
	"rect",
	"text",
	"tspan",
	"title",
	"desc",
	"defs",
	"linearGradient",
	"radialGradient",
	"stop",
	"clipPath",
	"mask",
	"pattern",
	"marker",
]);
const GLOBAL_ATTRIBUTES = new Set(["class", "dir", "hidden", "id", "lang", "role", "style", "tabindex", "title"]);
const HTML_ATTRIBUTES = new Set([
	"abbr",
	"align",
	"alt",
	"axis",
	"border",
	"cellpadding",
	"cellspacing",
	"char",
	"charoff",
	"checked",
	"cols",
	"colspan",
	"datetime",
	"disabled",
	"for",
	"headers",
	"height",
	"high",
	"label",
	"list",
	"low",
	"max",
	"maxlength",
	"min",
	"minlength",
	"multiple",
	"name",
	"open",
	"optimum",
	"pattern",
	"placeholder",
	"readonly",
	"required",
	"reversed",
	"rows",
	"rowspan",
	"scope",
	"selected",
	"size",
	"span",
	"start",
	"step",
	"type",
	"valign",
	"value",
	"width",
	"wrap",
]);
const SVG_ATTRIBUTES = new Set([
	"alignment-baseline",
	"baseline-shift",
	"clip-path",
	"clip-rule",
	"clippathunits",
	"color",
	"cx",
	"cy",
	"d",
	"dominant-baseline",
	"dx",
	"dy",
	"fill",
	"fill-opacity",
	"fill-rule",
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"fx",
	"fy",
	"gradienttransform",
	"gradientunits",
	"height",
	"letter-spacing",
	"marker-end",
	"marker-mid",
	"marker-start",
	"markerheight",
	"markerunits",
	"markerwidth",
	"mask",
	"maskcontentunits",
	"maskunits",
	"offset",
	"opacity",
	"orient",
	"overflow",
	"pathlength",
	"patterncontentunits",
	"patterntransform",
	"patternunits",
	"points",
	"preserveaspectratio",
	"r",
	"refx",
	"refy",
	"rx",
	"ry",
	"spreadmethod",
	"stop-color",
	"stop-opacity",
	"stroke",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke-width",
	"text-anchor",
	"textlength",
	"transform",
	"vector-effect",
	"viewbox",
	"width",
	"x",
	"x1",
	"x2",
	"y",
	"y1",
	"y2",
]);
const INPUT_TYPES = new Set([
	"button",
	"checkbox",
	"color",
	"date",
	"datetime-local",
	"email",
	"hidden",
	"month",
	"number",
	"radio",
	"range",
	"search",
	"tel",
	"text",
	"time",
	"url",
	"week",
]);
const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon);base64,[a-z\d+/]+={0,2}$/i;

function copyAttributes(source: Element, target: Element): void {
	const svg = source.namespaceURI === SVG_NAMESPACE;
	for (const attribute of Array.from(source.attributes)) {
		const name = attribute.name.toLowerCase();
		if (attribute.namespaceURI !== null) continue;
		if (name === "src" && source.localName === "img" && !svg) {
			if (RASTER_DATA_URL.test(attribute.value)) target.setAttribute("src", attribute.value);
			continue;
		}
		if (
			GLOBAL_ATTRIBUTES.has(name) ||
			name.startsWith("aria-") ||
			name.startsWith("data-") ||
			(svg ? SVG_ATTRIBUTES : HTML_ATTRIBUTES).has(name)
		) {
			target.setAttribute(attribute.name, attribute.value);
		}
	}
	// No form association, submit, autofill or file/password inputs are exposed.
	if (!svg && source.localName === "button") target.setAttribute("type", "button");
	if (!svg && (source.localName === "input" || source.localName === "textarea")) {
		target.setAttribute("autocomplete", "off");
	}
}

function appendSafeChildren(source: Node, target: Node, document: Document, depth: number): void {
	if (depth >= MAX_DEPTH) return;
	for (const child of Array.from(source.childNodes)) {
		if (child.nodeType === 3) {
			target.appendChild(document.createTextNode(child.textContent ?? ""));
			continue;
		}
		if (child.nodeType !== 1) continue;
		const element = child as Element;
		const name = element.localName;
		const svg = element.namespaceURI === SVG_NAMESPACE;
		if (svg ? !SVG_TAGS.has(name) : element.namespaceURI !== HTML_NAMESPACE || DROP_SUBTREE.has(name)) {
			continue;
		}
		if (!svg && !HTML_TAGS.has(name)) {
			// Flatten forms and unknown wrappers without ever constructing custom elements.
			appendSafeChildren(element, target, document, depth + 1);
			continue;
		}
		if (name === "input" && !INPUT_TYPES.has((element.getAttribute("type") ?? "text").toLowerCase())) {
			continue;
		}
		const clean = document.createElementNS(svg ? SVG_NAMESPACE : HTML_NAMESPACE, name);
		copyAttributes(element, clean);
		if (name === "style") {
			// Foreign-content parsing can put literal </style> inside a text node.
			// Escape every '<' before HTML serialization to prevent mutation XSS.
			clean.textContent = (element.textContent ?? "").replaceAll("<", "\\3c ");
		} else {
			appendSafeChildren(element, clean, document, depth + 1);
		}
		target.appendChild(clean);
	}
}

/** Build a static, offline srcDoc; the caller must use sandbox="" and no-referrer. */
export function createHtmlPreviewDocument(content: string, chromeStyle: string): string {
	if (typeof document === "undefined") {
		// Server rendering has no inert HTML parser. Fail closed as escaped source
		// instead of introducing a second, less reliable sanitization path.
		const escaped = content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		return `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta charset="utf-8"><style data-preview-chrome>${chromeStyle.replaceAll("<", "\\3c ")}</style></head><body><pre>${escaped}</pre></body></html>`;
	}
	// A template's owner document has neither a browsing context nor the host's
	// custom-element registry. DOMParser or detached nodes in the live document
	// can fetch resources or upgrade custom elements before sanitization finishes.
	const inertDocument = document.createElement("template").content.ownerDocument;
	const source = inertDocument.createElement("html");
	source.innerHTML = content;
	const html = inertDocument.createElement("html");
	const head = inertDocument.createElement("head");
	const body = inertDocument.createElement("body");
	const policy = inertDocument.createElement("meta");
	policy.setAttribute("http-equiv", "Content-Security-Policy");
	policy.setAttribute("content", PREVIEW_CSP);
	head.appendChild(policy);
	const charset = inertDocument.createElement("meta");
	charset.setAttribute("charset", "utf-8");
	head.appendChild(charset);
	const sourceHead = source.querySelector(":scope > head");
	const sourceBody = source.querySelector(":scope > body");
	if (sourceHead) appendSafeChildren(sourceHead, head, inertDocument, 0);
	if (sourceBody) {
		copyAttributes(sourceBody, body);
		appendSafeChildren(sourceBody, body, inertDocument, 0);
	}
	const chrome = inertDocument.createElement("style");
	chrome.setAttribute("data-preview-chrome", "");
	chrome.textContent = chromeStyle.replaceAll("<", "\\3c ");
	head.appendChild(chrome);
	html.append(head, body);
	return `<!DOCTYPE html>${html.outerHTML}`;
}
