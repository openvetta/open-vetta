// Vite `?url` asset imports resolve to a runtime URL string.
declare module "*.wasm?url" {
	const url: string;
	export default url;
}
