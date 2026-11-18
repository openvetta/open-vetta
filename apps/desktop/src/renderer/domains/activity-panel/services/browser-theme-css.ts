/**
 * 内置浏览器是独立文档，宿主的 `color-scheme` 不会随 iframe/webview 边界传进去，
 * Chromium 于是按浅色绘制 UA 拥有的部件（滚动条、表单控件、默认画布），深色主题下
 * 就会出现白底滚动条。这里把宿主解析后的主题作为 `color-scheme` 注入 guest。
 *
 * 只声明 color-scheme、不改站点自身的布局色：`:root` 的特异性高于站点常见的
 * `html { color-scheme: … }`，而作者样式里的具体颜色规则仍然照常生效。
 */
export function browserThemeCss(theme: "light" | "dark"): string {
	return `:root { color-scheme: ${theme}; }`;
}
