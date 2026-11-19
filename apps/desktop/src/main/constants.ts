import { config } from "dotenv";

// 仅在源码模式（bun run start，tsx 直跑 src/main/main.ts）下生效：通过 dotenv 加载
// 本地 .env 文件，让源码运行也能拿到开放市场仓库、代理等环境变量。
// 构建产物里这些 `process.env.X` 已被 vite define 在构建期替换为字面量。
// dotenv 不会覆盖已存在的变量，先加载的优先级更高。
config({ path: ".env.development", quiet: true });
config({ path: ".env", quiet: true });
