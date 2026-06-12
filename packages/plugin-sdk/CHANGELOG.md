# Changelog

All notable changes to `@vetta/plugin-sdk` are documented in this file.

## [Unreleased]

### Added

- Added the initial trusted plugin SDK contract with plugin lifecycle, permissions, global UI slot types, and `definePlugin()`.
- Added the file preview slot contract: `PluginUiApi.registerFilePreview`, `PluginFilePreviewContribution`, `PluginFilePreviewProps`, `PluginPreviewFile` (metadata + `readText`/`readBytes`/`getUrl` accessors), and the `ui.slot.file-preview` permission.
- Added the conversation API: `PluginContext.conversation` (`sendPrompt` / `insertText` / `abort` / `on`), `ConversationState` / `ConversationMessage` / `ConversationEvent` types, and the `useActiveConversation()` / `useConversationMessages()` hooks (backed by a host bridge injected via `__setPluginHostBridge`).
