/**
 * Desktop Electron smoke：验证 WDIO + @wdio/electron-service 能拉起应用并访问主进程。
 * 运行前需有 dist/ 产物（默认）或 release/*-unpacked（VETTA_E2E_PACKAGED=1）。
 */
describe("Vetta Desktop smoke", () => {
	it("主进程可执行 Electron API", async () => {
		// execute 回调在 Electron 主进程执行；参数类型由 service 注入，此处只断言返回值形状。
		const snapshot = await browser.electron.execute((electron) => {
			return {
				ready: electron.app.isReady(),
				name: electron.app.getName(),
				windowCount: electron.BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed()).length,
			};
		});

		expect(snapshot.ready).toBe(true);
		expect(snapshot.name.length).toBeGreaterThan(0);
		expect(snapshot.windowCount).toBeGreaterThanOrEqual(1);
	});

	it("渲染进程 document 可访问", async () => {
		await browser.waitUntil(
			async () => {
				const readyState = await browser.execute(() => document.readyState);
				return readyState === "complete" || readyState === "interactive";
			},
			{
				timeout: 60_000,
				timeoutMsg: "渲染进程 document 未进入 ready 状态",
			},
		);

		const body = await $("body");
		await expect(body).toExist();
	});
});
