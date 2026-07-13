/**
 * MCP (Model Context Protocol) Module
 *
 * Provides integration with MCP servers for extending agent capabilities
 * with external tools and data sources.
 */

// Client
export * from "./mcp-client.js";
// Configuration
export * from "./mcp-config.js";
// HTTP client
export * from "./mcp-http-client.js";
// Manager
export * from "./mcp-manager.js";
// OAuth (remote HTTP MCP)
export * from "./mcp-oauth-flow.js";
export * from "./mcp-oauth-provider.js";
export * from "./mcp-oauth-storage.js";
// Process management
export * from "./mcp-process.js";

// Tool adapter
export * from "./mcp-tool-adapter.js";
// Types
export * from "./types.js";
