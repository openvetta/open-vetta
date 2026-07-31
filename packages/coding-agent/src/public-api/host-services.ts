/**
 * Coding Agent 的宿主侧状态服务适配器。
 *
 * Greenfield Runtime 只通过窄 Port 消费这些资源；Desktop Composition Root
 * 可以在进程边界创建并持有具体实现。
 */
export { AuthStorage } from "../core/auth-storage.js";
export { ModelRegistry } from "../core/model-registry.js";
export { SettingsManager } from "../core/settings-manager.js";
