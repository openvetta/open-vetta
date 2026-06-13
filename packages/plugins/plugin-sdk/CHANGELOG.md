# Changelog

All notable changes to `@vetta/plugin-sdk` are documented in this file.

## [Unreleased]

### Added

- Added the initial trusted plugin SDK contract with plugin lifecycle, permissions, global UI slot types, and `definePlugin()`.
- Added the file preview slot contract: `PluginUiApi.registerFilePreview`, `PluginFilePreviewContribution`, `PluginFilePreviewProps`, `PluginPreviewFile` (metadata + `readText`/`readBytes`/`getUrl` accessors), and the `ui.slot.file-preview` permission.
- Added the conversation API: `PluginContext.conversation` (`sendPrompt` / `insertText` / `abort` / `on`), `ConversationState` / `ConversationMessage` / `ConversationEvent` types, and the `useActiveConversation()` / `useConversationMessages()` hooks (backed by a host bridge injected via `__setPluginHostBridge`).
- Added the activity-tab slot contract: `PluginUiApi.registerActivityTab`, `PluginActivityTabContribution` (`id` / `label` / optional React-node `icon` / `component`), and the `ui.slot.activity-tab` permission. Registration only enters the addable pool — the tab renders after the user attaches it in the activity panel (attach records are keyed by session cwd).
- Added `useActivityTab()` and `ActivityTabContextValue`: a React-context hook exposing the cwd scope of the activity panel the tab is rendered in (provided by the host via the internal `__ActivityTabContext`). Use this instead of `useActiveConversation().cwd`, which can point at another project on the project detail page.
