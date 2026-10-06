/**
 * Focused, offline Electron boundary test. Run with the repository's Electron:
 * VETTA_BUN=/path/to/bun apps/desktop/node_modules/.bin/electron apps/desktop/test/html-preview-security.electron.cjs
 * Uses a temporary profile and trusted CDP DOM/CSS/Input commands, never an
 * injected JavaScript world in the scriptless untrusted frame.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createRequire } = require("node:module");
const { app, BrowserWindow } = require("electron");

const repo = resolve(__dirname, "../../..");
const temporary = mkdtempSync(join(tmpdir(), "vetta-html-security-"));
const requireDesktop = createRequire(join(repo, "apps/desktop/package.json"));
const requests = [];
const frameSessions = new Map();
let window;

app.setPath("userData", join(temporary, "profile"));
app.commandLine.appendSwitch("site-per-process");

function bundleFixture() {
	const entry = join(temporary, "fixture.ts");
	writeFileSync(entry, `
import React from ${JSON.stringify(requireDesktop.resolve("react"))};
import { createRoot } from ${JSON.stringify(requireDesktop.resolve("react-dom/client"))};
import { flushSync } from ${JSON.stringify(requireDesktop.resolve("react-dom"))};
import { HtmlPreviewView } from ${JSON.stringify(join(repo, "packages/theme-ui/src/activity/HtmlPreviewView.tsx"))};
const root = createRoot(document.getElementById("root"));
window.__hostTouches = 0;
window.vetta = { touch: () => { window.__hostTouches += 1; } };
window.__renderPreview = (content) => new Promise(resolve => {
  flushSync(() => root.render(React.createElement(HtmlPreviewView, { content, title: "Security fixture" })));
  document.querySelector("iframe").addEventListener("load", () => resolve(true), { once: true });
});
`);
	execFileSync(process.env.VETTA_BUN || "bun", [
		"build", entry, "--target=browser", "--format=iife", `--outfile=${join(temporary, "fixture.js")}`,
	], { cwd: repo, stdio: "inherit" });
	writeFileSync(join(temporary, "fixture.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>html,body,#root{margin:0;width:760px;height:560px}iframe{position:absolute;inset:0;width:760px;height:560px;border:0}</style>
</head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
}

function send(method, parameters = {}, session) {
	return window.webContents.debugger.sendCommand(method, parameters, session);
}

async function frameSession() {
	const sessions = [...frameSessions.keys()];
	for (const session of sessions) {
		try {
			await send("DOM.enable", {}, session);
			const { root } = await send("DOM.getDocument", {}, session);
			const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fixture-heading" }, session);
			if (nodeId) return { session, root: root.nodeId };
		} catch {
			// A replaced srcDoc can leave a detached target queued for cleanup.
		}
	}
	throw new Error("The loaded preview's OOPIF target was not available to trusted CDP");
}

async function query(frame, selector) {
	const { nodeId } = await send("DOM.querySelector", { nodeId: frame.root, selector }, frame.session);
	return nodeId;
}

async function attributes(frame, selector) {
	const nodeId = await query(frame, selector);
	assert.ok(nodeId, `Missing ${selector}`);
	const { attributes: values } = await send("DOM.getAttributes", { nodeId }, frame.session);
	const result = {};
	for (let index = 0; index < values.length; index += 2) result[values[index]] = values[index + 1];
	return result;
}

async function click(frame, selector) {
	const nodeId = await query(frame, selector);
	assert.ok(nodeId, `Missing ${selector}`);
	await send("DOM.scrollIntoViewIfNeeded", { nodeId }, frame.session);
	const { model } = await send("DOM.getBoxModel", { nodeId }, frame.session);
	const box = model.content;
	const x = (box[0] + box[2] + box[4] + box[6]) / 4;
	const y = (box[1] + box[3] + box[5] + box[7]) / 4;
	await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, frame.session);
	await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, frame.session);
}

async function computed(frame, selector, property) {
	await send("CSS.enable", {}, frame.session);
	const nodeId = await query(frame, selector);
	const { computedStyle } = await send("CSS.getComputedStyleForNode", { nodeId }, frame.session);
	return computedStyle.find((entry) => entry.name === property)?.value;
}

const source = `<!doctype html><html><head>
<meta http-equiv="refresh" content="0;url=https://preview-attack.invalid/refresh">
<base href="https://preview-attack.invalid/"><link rel="stylesheet" href="https://preview-attack.invalid/sheet">
<style>@import url("https://preview-attack.invalid/import");
@font-face { font-family: leak; src: url("https://preview-attack.invalid/font"); }
#probe { background-image: url("https://preview-attack.invalid/css"); font-family: leak; }
.panel { display: none; } #second:checked ~ .panel { display: block; }
</style></head><body>
<h1 id="fixture-heading">Static report</h1><div id="probe">Offline content</div>
<form action="https://preview-attack.invalid/form"><input id="first" type="radio" name="tabs" checked>
<label for="first">First</label><input id="second" type="radio" name="tabs"><label for="second">Second</label>
<div class="panel">Second panel</div><input id="toggle" type="checkbox"><label for="toggle">Toggle</label>
<button id="submit" type="submit" formaction="https://preview-attack.invalid/submit">Static button</button></form>
<details id="details"><summary>More</summary><p>Detail content</p></details>
<a id="link" href="https://preview-attack.invalid/nav" target="_top" ping="https://preview-attack.invalid/ping">Link</a>
<a id="fragment" href="#fixture-heading">Fragment</a>
<img src="https://preview-attack.invalid/image" onerror="parent.vetta.touch()">
<img id="raster" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=">
<svg id="chart" viewBox="0 0 100 40"><rect width="80" height="30" fill="green" />
<foreignObject><iframe src="https://preview-attack.invalid/foreign"></iframe></foreignObject></svg>
<input type="file"><input type="password"><input type="image" src="https://preview-attack.invalid/input">
<script>parent.vetta.touch(); window.open('https://preview-attack.invalid/popup'); fetch('https://preview-attack.invalid/fetch');
location.href='https://preview-attack.invalid/self'; require('electron').ipcRenderer.send('preview-attack');</script>
<iframe src="https://preview-attack.invalid/frame"></iframe><object data="https://preview-attack.invalid/object"></object>
</body></html>`;

async function verify() {
	bundleFixture();
	await app.whenReady();
	window = new BrowserWindow({
		show: false, width: 780, height: 600,
		webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
	});
	window.webContents.setWindowOpenHandler(() => { throw new Error("Preview attempted to open a popup"); });
	window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
		const allowed = details.url.startsWith(`file://${temporary}/`) || details.url.startsWith("data:") || details.url === "about:blank";
		if (!allowed) requests.push(details.url);
		callback({ cancel: !allowed });
	});
	window.webContents.debugger.attach("1.3");
	window.webContents.debugger.on("message", (_event, method, parameters) => {
		if (method === "Target.attachedToTarget" && parameters.targetInfo.type === "iframe") {
			frameSessions.set(parameters.sessionId, parameters.targetInfo.targetId);
		}
		if (method === "Target.detachedFromTarget") frameSessions.delete(parameters.sessionId);
	});
	await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
	await window.loadFile(join(temporary, "fixture.html"));
	await window.webContents.executeJavaScript(`window.__renderPreview(${JSON.stringify(source)})`);
	const frame = await frameSession();
	const host = await window.webContents.executeJavaScript(`(() => {
const frame = document.querySelector('iframe');
return { sandbox: frame.getAttribute('sandbox'), referrer: frame.referrerPolicy,
  opaque: frame.contentDocument === null, hostTouches: window.__hostTouches,
  node: typeof require, ipc: typeof window.electron };
})()`);
	assert.deepEqual(host, { sandbox: "", referrer: "no-referrer", opaque: true, hostTouches: 0, node: "undefined", ipc: "undefined" });
	const policy = await attributes(frame, "head > :first-child");
	assert.equal(policy["http-equiv"], "Content-Security-Policy");
	assert.ok(policy.content.includes("script-src 'none'"));
	assert.ok(policy.content.includes("connect-src 'none'"));
	assert.equal(await query(frame, "script, iframe, object, form, foreignObject, input[type=file], input[type=password], input[type=image]"), 0);
	assert.equal((await attributes(frame, "#chart")).viewBox, "0 0 100 40");
	assert.equal(await computed(frame, "#raster", "width"), "1px");
	assert.equal((await attributes(frame, "#link")).href, undefined);
	assert.equal((await attributes(frame, "#fragment")).href, undefined);
	assert.equal(await computed(frame, ".panel", "display"), "none");
	await click(frame, "#second");
	assert.ok(await query(frame, "#second:checked"));
	assert.equal(await query(frame, "#first:checked"), 0);
	assert.equal(await computed(frame, ".panel", "display"), "block");
	await click(frame, "#toggle");
	assert.ok(await query(frame, "#toggle:checked"));
	await click(frame, "summary");
	assert.ok(await query(frame, "#details[open]"));
	await click(frame, "#link");
	await click(frame, "#submit");
	assert.ok(await query(frame, "#fixture-heading"));
	assert.equal(await window.webContents.executeJavaScript("window.__hostTouches"), 0);
	assert.deepEqual(requests, [], "Neither inert parsing nor the preview may make external/file requests");

	// Validate the browser restriction separately from the sanitizer: even trusted
	// test instrumentation cannot run an ordinary script in this sandboxed frame.
	const sourceFrame = window.webContents.mainFrame.frames.find((entry) => entry.url === "about:srcdoc");
	assert.ok(sourceFrame, "Missing preview frame");
	await assert.rejects(sourceFrame.executeJavaScript("typeof require"), /script|sandbox|execution/i);
	console.log("PASS: static preview, native controls, offline CSP, opaque origin, no script/Node/IPC/navigation access");
}

const timeout = setTimeout(() => {
	console.error("FAIL: HTML preview security test timed out");
	app.exit(1);
}, 30000);

verify().then(() => {
	clearTimeout(timeout);
	window?.destroy();
	rmSync(temporary, { recursive: true, force: true });
	app.exit(0);
}).catch((error) => {
	clearTimeout(timeout);
	console.error(error);
	window?.destroy();
	rmSync(temporary, { recursive: true, force: true });
	app.exit(1);
});
