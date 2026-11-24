import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	resolve: {
		// 宿主组件（SegmentedControl 等）依赖 motion，它自带一份 React 解析路径；
		// 不一起去重会拿到第二个 React 实例，渲染时 useContext 为 null。
		dedupe: ["react", "react-dom", "motion", "framer-motion"],
	},
	ssr: { resolve: { mainFields: ["module", "main"] } },
	test: {
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.{ts,tsx}"],
		// ESM dependencies use Vite's deduplication; setup.ts handles CJS peers.
		server: {
			deps: {
				inline: [
					"radix-ui",
					/@radix-ui\//,
					/@floating-ui\//,
					"lucide-react",
					/react-remove-scroll/,
					"react-style-singleton",
					"use-callback-ref",
					"use-sidecar",
				],
			},
		},
	},
});
