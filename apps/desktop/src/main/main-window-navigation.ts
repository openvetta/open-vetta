/**
 * 主窗口只承载 Vetta 自己的页面。渲染进程里任何未经处理的 `<a href>` 点击都会触发顶层导航，
 * 把整个应用替换成外部网页且没有返回入口，所以离开应用自身页面的导航一律拦下。
 */
export function isAppSelfNavigation(targetUrl: string, currentUrl: string): boolean {
	let target: URL;
	let current: URL;
	try {
		target = new URL(targetUrl);
		current = new URL(currentUrl);
	} catch {
		return false;
	}
	if (target.protocol === "file:" || current.protocol === "file:") {
		return target.protocol === current.protocol && target.pathname === current.pathname;
	}
	return target.origin === current.origin;
}
