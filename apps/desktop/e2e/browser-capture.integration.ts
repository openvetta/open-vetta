/** Standalone Electron integration: uses an isolated temporary profile, never a running Desktop. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, join } from "node:path";
import { app, BrowserWindow, nativeImage, type WebContents } from "electron";
import { BrowserCaptureService } from "../src/main/browser-capture/capture-service.js";
import { frameBrowserScreenshot } from "../src/renderer/domains/activity-panel/services/capture-image.js";

async function run() {
	const profile = await mkdtemp(join(tmpdir(), "vetta-browser-capture-"));
	app.setPath("userData", profile);
	let owner: BrowserWindow | undefined;
	try {
		await app.whenReady();
		console.log("Electron ready");
		owner = new BrowserWindow({
			show: false,
			width: 900,
			height: 700,
			webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false },
		});
		const ready = new Promise<WebContents>((resolve) =>
			owner?.webContents.once("did-attach-webview", (_event, guest) =>
				guest.once("did-finish-load", () => resolve(guest)),
			),
		);
		const page = `<html><body style="margin:0;height:2400px"><button id="save" style="position:absolute;left:40px;top:60px;width:160px;height:60px" onclick="document.body.dataset.clicked='yes'">Save <span>changes</span></button><div id="scroller" style="position:absolute;left:300px;top:100px;width:200px;height:150px;overflow:auto"><div style="height:900px">Scroll me</div></div><input type=password value=SECRET_VALUE><p hidden>HIDDEN_TEXT</p><iframe style="position:absolute;top:300px" srcdoc="<button>Embedded</button>"></iframe></body></html>`;
		await owner.loadURL(
			`data:text/html,${encodeURIComponent(`<html><body style="margin:0"><webview src="data:text/html,${encodeURIComponent(page)}" style="width:800px;height:600px"></webview></body></html>`)}`,
		);
		console.log("Owner page loaded");
		const guest = await Promise.race([
			ready,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Guest load timed out")), 15000)),
		]);
		console.log("Guest ready");
		guest.on("console-message", (_event, _level, message) => console.log("Guest:", message));
		const service = new BrowserCaptureService(owner.webContents);
		for (const zoom of [1, 1.25]) {
			guest.setZoomFactor(zoom);
			const target = await guest.executeJavaScript(
				`(()=>{const r=document.querySelector('#save').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
			);
			const result = await service.inspect(guest.id, target);
			assert.equal(result.elements[0]?.element.tag, "button");
			assert.equal(result.elements[0]?.element.locator, "#save");
			assert.equal(result.elements[0]?.element.text, "Save changes");
			assert.ok(
				result.elements.every(
					({ element }) => !element.text.includes("SECRET_VALUE") && !element.text.includes("HIDDEN_TEXT"),
				),
			);
			assert.ok(Math.abs((result.elements[0]?.rect.x ?? 0) - 40) < 1);
			const screenshot = await service.capture(guest.id, result.url);
			assert.ok(screenshot.data.startsWith("iVBOR"));
			assert.ok(screenshot.width > 0 && screenshot.height > 0);
			await owner.webContents.executeJavaScript(
				"document.documentElement.style.setProperty('--primary','#cccccc');document.documentElement.style.setProperty('--color-browser-selection','#008cff')",
			);
			const framed = await owner.webContents.executeJavaScript(
				`(${frameBrowserScreenshot.toString()})(${JSON.stringify(screenshot.data)},{x:10,y:20,width:100,height:40},${JSON.stringify(result.viewport)})`,
			);
			const png = nativeImage.createFromBuffer(Buffer.from(framed.data, "base64"));
			assert.deepEqual(png.getSize(), { width: framed.width, height: framed.height });
			const pixelX = Math.round((10 * framed.width) / result.viewport.width);
			const pixelY = Math.round((20 * framed.height) / result.viewport.height);
			const offset = (pixelY * framed.width + pixelX) * 4;
			const bitmap = png.toBitmap();
			assert.ok(
				bitmap[offset] > 240 && bitmap[offset + 1] > 120 && bitmap[offset + 1] < 160 && bitmap[offset + 2] < 20,
				"Selection border is vivid blue in the full viewport PNG despite a gray app theme",
			);
			const innerOffset = (pixelY * framed.width + pixelX + 1) * 4;
			assert.ok(bitmap[innerOffset] > 240 && bitmap[innerOffset + 2] < 20, "Selection border extends beyond one pixel");
		}
		for (const zoom of [1, 1.25]) {
			guest.setZoomFactor(zoom);
			console.log("Nested scroll test", zoom);
			await guest.executeJavaScript("document.querySelector('#scroller').scrollTop=0");
			console.log("Reset scroller");
			const point = await guest.executeJavaScript(
				"(()=>{const r=document.querySelector('#scroller').getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()",
			);
			console.log("Wheel point", point);
			await service.scroll(guest.id, { x: 0, y: 100, point });
			await guest.executeJavaScript(
				"new Promise(resolve=>{const node=document.querySelector('#scroller');if(node.scrollTop>0)return resolve(true);node.addEventListener('scroll',()=>resolve(true),{once:true});setTimeout(()=>resolve(false),1000)})",
			);
			assert.ok(
				await guest.executeJavaScript("document.querySelector('#scroller').scrollTop > 0"),
				`Nested scroll at zoom ${zoom}`,
			);
		}
		await owner.webContents.executeJavaScript(
			`(()=>{const overlay=document.createElement('div');overlay.id='selection';overlay.style='position:fixed;inset:0;z-index:10';document.body.append(overlay)})()`,
		);
		owner.webContents.sendInputEvent({ type: "mouseDown", x: 100, y: 100, button: "left", clickCount: 1 });
		owner.webContents.sendInputEvent({ type: "mouseUp", x: 100, y: 100, button: "left", clickCount: 1 });
		assert.equal(await guest.executeJavaScript("document.body.dataset.clicked ?? null"), null);
		const stranger = new BrowserWindow({ show: false });
		await assert.rejects(
			new BrowserCaptureService(stranger.webContents).capture(guest.id, guest.getURL()),
			/Untrusted/,
		);
		stranger.destroy();
		await guest.loadURL("about:blank");
		await assert.rejects(service.capture(guest.id, "https://previous.test/"), /changed/);
		console.log(
			"Browser capture Electron integration passed: ownership, zoom coordinates, PNG capture, safe element text, pointer interception, navigation invalidation.",
		);
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	} finally {
		owner?.destroy();
		if (dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith("vetta-browser-capture-"))
			await rm(profile, { recursive: true, force: true }).catch(() => undefined);
		app.exit(process.exitCode ?? 0);
	}
}
void run();
