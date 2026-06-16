# Changelog

All notable changes to `@vetta/plugin-sdk` are documented in this file.

## [Unreleased]

### Added

- Added the initial trusted plugin SDK contract with plugin lifecycle, permissions, global UI slot types, and `definePlugin()`.
- Added plugin agent tool and file API contracts: `PluginContext.agent.registerTool()`, TypeBox/JSON-Schema-friendly tool registration types, `PluginContext.fs`, and the `agent.tools.register`, `agent.toolHandler.execute`, `fs.read`, and `fs.write` permissions.
- Added the file preview slot contract: `PluginUiApi.registerFilePreview`, `PluginFilePreviewContribution`, `PluginFilePreviewProps`, `PluginPreviewFile` (metadata + `readText`/`readBytes`/`getUrl` accessors), and the `ui.slot.file-preview` permission.
- Added the conversation API: `PluginContext.conversation` (`sendPrompt` / `insertText` / `abort` / `on`), `ConversationState` / `ConversationMessage` / `ConversationEvent` types, and the `useActiveConversation()` / `useConversationMessages()` hooks (backed by a host bridge injected via `__setPluginHostBridge`).
- Added the activity-tab slot contract: `PluginUiApi.registerActivityTab`, `PluginActivityTabContribution` (`id` / `label` / optional React-node `icon` / `component`), and the `ui.slot.activity-tab` permission. Registration only enters the addable pool — the tab renders after the user attaches it in the activity panel (attach records are keyed by session cwd).
- Added `useActivityTab()` and `ActivityTabContextValue`: a React-context hook exposing the cwd scope of the activity panel the tab is rendered in (provided by the host via the internal `__ActivityTabContext`). Use this instead of `useActiveConversation().cwd`, which can point at another project on the project detail page.
- Added the input-action slot: `PluginUiApi.registerInputAction`, `PluginInputActionContribution` (toggle with `label`/`icon`/`onToggle`/`decoratePrompt`), `PluginPromptDecoration`, and the `ui.slot.input-action` permission. While active, `decoratePrompt()` merges metadata into the next outgoing prompt (e.g. `{ imageMode: true }`).
- Added the per-message slot: `PluginUiApi.registerMessageSlot`, `PluginMessageSlotContribution`, `PluginMessageSlotProps`, `PluginMessageSlotMessage` (extends `ConversationMessage` with host-bound `imageRefs`), and the `ui.slot.message` permission. Components stack beneath each message; return null when there is nothing to render.
- Added `PluginUiApi.openActivityTab(tabId)`: programmatically attach + activate one of the plugin's own activity tabs in the current conversation's panel.
- Added `PluginImagesApi.sessionLineages(sessionId)` and the `useEditImageAttachment()` hook: list every edit lineage a session touched (newest first; each oldest→newest) for a "history" panel, and reactively read the current edit-attachment (single source of truth for the "selected for edit" highlight).
- Added `PluginUiApi.setEditImageAttachment(ref | null)`: bind (or clear) an image as the next prompt's edit target. The host renders it as a thumbnail capsule in the AI input bar's top strip and injects `metadata.editImageId` at send time (one-shot). Added `PluginImageRef.rootId` (edit-lineage root, carried in the result marker for per-message preview dedup) and `PluginMessageSlotMessage.editingImageId` (host-bound; the source image of an in-flight edit turn, so a slot can render the full version lineage with a leading skeleton).
- Added the images API: `PluginContext.images` (`generate` / `edit` / `lineage`), `PluginImagesApi`, `PluginImageRef`, `PluginGenerateImageInput` (with optional `size`), `PluginEditImageInput`, and the `images.generate` permission. Routed to the host's main-process image service; bytes are stored out-of-band and returned as media references.
- Added the settings API: `PluginContext.settings` (`get` / `getAll` / `onChange`) and `PluginSettingsApi`, reading values configured against a plugin's declared `contributes.settings` schema.
