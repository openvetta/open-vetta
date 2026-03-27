import { config } from "dotenv";

// dotenv 不会覆盖已存在的变量，先加载的优先级更高
// 优先级: .env.development > .env
config({ path: ".env.development" });
config({ path: ".env" });

export const DEFAULT_SERVER_URL = process.env.VETTA_SERVER_URL || "http://127.0.0.1:8080/api/v1";
