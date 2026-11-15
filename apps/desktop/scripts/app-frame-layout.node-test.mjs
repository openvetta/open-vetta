import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(desktop, "../..");
const desktopRequire = createRequire(join(desktop, "package.json"));
const repoRequire = createRequire(join(repo, "package.json"));
// Reuse the browser automation dependency already provided by the repository CLI.
const playwrightRequire = createRequire(repoRequire.resolve("@playwright/cli/package.json"));
const { _electron: electron } = playwrightRequire("playwright");

async function geometry(page) {
	return page.evaluate(() => {
		const frame = document.querySelector(".app-frame");
		const sidebar = document.querySelector(".sidebar-surface").getBoundingClientRect();
		const bottom = document.querySelector('[data-testid="sidebar-bottom"]').getBoundingClientRect();
		return {
			scrollTop: frame.scrollTop,
			scrollLeft: frame.scrollLeft,
			scrollRange: frame.scrollHeight - frame.clientHeight,
			sidebarTop: sidebar.top,
			sidebarBottom: sidebar.bottom,
			bottom: bottom.bottom,
			height: innerHeight,
		};
	});
}

async function assertAnchored(page) {
	const result = await geometry(page);
	assert.equal(result.scrollTop, 0, "应用外框不能被程序向下滚动");
	assert.equal(result.scrollLeft, 0, "应用外框不能被程序横向滚动");
	assert.equal(result.sidebarTop, 0, "侧边栏不能被外框滚动抬高");
	assert.equal(result.sidebarBottom, result.height, "侧边栏必须贴住窗口底边");
	assert.equal(result.bottom, result.height, "设置底栏必须贴住窗口底边");
}

test("Electron：聊天、新会话、列表滚动与侧栏切换不改变侧边栏垂直位置", { timeout: 120_000 }, async () => {
	const directory = await mkdtemp(join(repo, ".app-frame-layout-"));
	let application;
	try {
		const entry = join(directory, "index.html");
		await writeFile(
			entry,
			'<!doctype html><html data-platform="mac"><div id="root"></div><script type="module" src="/apps/desktop/e2e/fixtures/app-frame-layout.tsx"></script></html>',
		);
		await build({
			configFile: false,
			root: repo,
			logLevel: "error",
			base: "./",
			plugins: [tailwindcss()],
			esbuild: { jsx: "automatic" },
			build: {
				outDir: join(directory, "dist"),
				rollupOptions: { input: entry },
			},
		});
		const main = join(directory, "main.cjs");
		await writeFile(
			main,
			`const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(directory, "profile"))});
app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{sandbox:true}});window.loadFile(${JSON.stringify(join(directory, "dist", directory.slice(repo.length + 1), "index.html"))});});`,
		);
		const env = { ...process.env };
		delete env.ELECTRON_RUN_AS_NODE;
		application = await electron.launch({
			executablePath: desktopRequire("electron"),
			args: [main],
			env,
		});
		const page = await application.firstWindow();
		page.setDefaultTimeout(10_000);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.getByRole("button", { name: "打开已有会话", exact: true }).waitFor();

		for (const platform of ["mac", "win"]) {
			await page.evaluate((value) => {
				document.documentElement.dataset.platform = value;
			}, platform);
			for (let iteration = 0; iteration < 3; iteration++) {
				await page.getByRole("button", { name: "打开已有会话", exact: true }).click();
				assert.equal((await geometry(page)).scrollRange, 0, "沉浸聊天页背景不能制造额外滚动空间");
				const sessions = page.locator('[aria-label="会话列表"]');
				await sessions.hover();
				await page.mouse.wheel(0, 600);
				await page.waitForFunction(() => document.querySelector('[aria-label="会话列表"]').scrollTop > 0);
				await page
					.getByRole("button", { name: "会话 60", exact: true })
					.evaluate((element) => element.scrollIntoView({ block: "start" }));
				await page.getByRole("textbox", { name: "消息输入框" }).fill("继续追问");
				await page
					.getByRole("textbox", { name: "消息输入框" })
					.evaluate((element) => element.scrollIntoView({ block: "start" }));
				await page.locator(".app-frame").evaluate((element) => {
					element.scrollTop = 8;
					element.scrollLeft = 8;
				});
				await assertAnchored(page);
				await page.getByRole("button", { name: "切换侧边栏", exact: true }).click();
				await page.locator(".sidebar-dock[inert]").waitFor({ state: "attached" });
				assert.equal((await geometry(page)).scrollRange, 0, "收起侧栏后背景仍不能超出窗口");
				await page.getByRole("button", { name: "切换侧边栏", exact: true }).click();
				await assertAnchored(page);
				await page.getByRole("button", { name: "新会话", exact: true }).click();
				await page.getByText("新会话页面", { exact: true }).waitFor();
				await assertAnchored(page);
			}
		}

		// Plugin/decorative overflow must not turn the fixed application shell into a scroll container.
		await page.getByRole("button", { name: "打开已有会话", exact: true }).click();
		await page.locator(".app-main-frame").evaluate((element) => {
			const decoration = document.createElement("div");
			decoration.style.cssText = "position:absolute;bottom:-32px;right:-32px;width:1px;height:1px";
			element.append(decoration);
			document.querySelector(".app-frame").scrollTo(100, 100);
		});
		await assertAnchored(page);
	} finally {
		try {
			await application?.close();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
});
