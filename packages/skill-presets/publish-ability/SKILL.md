---
name: publish-ability
description: Publish a skill, scene, MCP server, plugin, or bundle to the Vetta ability marketplace. Use when the user asks to upload/publish/submit an ability, put a plugin on the marketplace, share a skill with other users, or migrate an existing package into Vetta.
metadata:
  version: 1.0.0
  author: Vetta
  category: 开发
---

# Publish an Ability to the Vetta Marketplace

Submit an ability through the built-in `vetta` MCP server. It is always available — the user
does not install or configure it.

Tools:

- `upload_ability` — submit a new ability or a new version of an existing one.
- `list_my_abilities` — check review status and rejection reasons.

## Before you call the tool

Do these in order. Skipping step 2 is the most common cause of a rejected submission.

1. **Determine the type.** Ask the user if it is not obvious from the artifact.

   | Type | What it is | Physical artifact |
   | --- | --- | --- |
   | `skill` | A `SKILL.md` workflow | `.zip` / `.tar.gz` containing `SKILL.md` |
   | `scene` | A skill installed into the scene directory | same as `skill` |
   | `plugin` | A Vetta plugin | `.zip` containing `plugin.json` |
   | `mcp` | One entry in the user's `mcp.json` | none — config only |
   | `bundle` | A named group of already-published abilities | none — references only |

2. **Write `detail`. All four of these are required and the submission is rejected without them:**
   `name`, `description`, `author`, `content`.

   Do not invent them. Read the package: `plugin.json` (`name`/`description`/`author`), `SKILL.md`
   frontmatter, `README.md`, `LICENSE`. Ask the user for anything you cannot source. `content` is
   the detail-page body in markdown — it is what a user reads to decide whether to install, so
   write what the ability does, when to use it, and any setup it needs. A one-line `content` is
   not acceptable.

3. **Gather the type-specific requirement.** `skill`/`scene`/`plugin` need `package_path`
   (an absolute path to a local archive); `mcp` needs `mcp_config`; `bundle` needs `members`.
   `mcp` and `bundle` also need an explicit `slug`. For packaged types the slug comes from the
   manifest (`plugin.json` `id`, or `SKILL.md` `name`) — do not pass one.

4. **Call `upload_ability`.** If it returns errors, it returns *all* of them at once. Fix the
   whole list before retrying rather than resubmitting after each single fix.

## Field reference

`detail` is the single source of truth for everything shown in the marketplace — the server keeps
no separate columns for display fields.

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Card and detail-page title |
| `description` | yes | One sentence, shown on the card |
| `author` | yes | Attribution |
| `content` | yes | Detail-page body, markdown |
| `license` | no | e.g. `MIT` |
| `icon` | no | Empty, `solar:<name>-bold` (Iconify Solar), or an `http(s)://` URL. **Nothing else validates.** |
| `tags` | no | Free-form; orthogonal to `category` |
| `showcases` | no | Structured hero panels, see below |
| `meta` | no | Ordered list of `{key?, label?, value}`; `key` must be `homepage`/`repository`/`docs`/`license` |
| `i18n` | no | `{ "<locale>": { …same fields… } }` |

### Showcases

Each entry needs `template`, `user_prompt`, and `assistant_reply`. `template` is either
`chat-over-canvas` (the ability produces an artifact — pass `canvas` as `design`/`code`/`docs`/`generic`)
or `chat-thread` (conversation only; `canvas` is rejected here). Write prompts that show a real
use of the ability, not placeholders.

### Multi-language

Put the default language at the top level of `detail` and other languages under `detail.i18n`.
A locale that omits a field falls back to the top level, so translate only what differs.

**For plugins, do not hand-write `i18n` for text that already lives in the package.** If
`plugin.json` uses `%key%` placeholders for `name`/`description` and ships `locales/*.json`, the
server expands every locale automatically at upload time. Only add `detail.i18n` for marketplace
copy that is not in the package — typically `content`, `showcases`, and `meta`.

## Review

Submissions from non-administrators enter a review queue and are **not** visible in the
marketplace until an administrator approves them. Tell the user this rather than implying the
ability is live.

Re-submitting an ability that is already published does not disturb it: the new version waits in
a pending slot while the marketplace keeps serving the current version, so installed users are
unaffected until the update is approved.

Use `list_my_abilities` to report progress. `review_status` is `pending`, `approved`, or
`rejected` (reason in `review_note`); a non-empty `pending_version` means an update is queued
behind the live version.

You may only submit updates to abilities you own. Submitting to a slug owned by someone else is
rejected.

## Verify

After a successful call, state the returned `slug`, `version`, and whether the ability is live or
pending review. If the call failed, fix every listed error and retry — do not report success.

## Example

A plugin whose package already carries its own translations:

```json
{
  "type": "plugin",
  "package_path": "/Users/me/build/lottie-studio.zip",
  "category": "设计",
  "detail": {
    "name": "Lottie Studio",
    "description": "用 AI 生成并预览 Lottie 动画",
    "author": "Vetta Labs",
    "license": "MIT",
    "icon": "solar:magic-stick-3-bold",
    "tags": ["设计", "动画"],
    "content": "# Lottie Studio\n\n生成、预览并微调 Lottie 动画。\n\n## 使用\n\n描述你想要的动画，插件会生成 Lottie JSON 并实时预览。\n\n## 需要\n\n一个可用的模型服务商。",
    "meta": [
      { "key": "repository", "value": "https://github.com/example/lottie-studio" },
      { "key": "license", "value": "MIT" }
    ],
    "showcases": [
      {
        "template": "chat-over-canvas",
        "canvas": "design",
        "user_prompt": "做一个加载中的圆环动画",
        "assistant_reply": "已生成一个 2 秒循环的圆环加载动画，可在右侧预览并调整配色。"
      }
    ],
    "i18n": {
      "en": {
        "content": "# Lottie Studio\n\nGenerate, preview and fine-tune Lottie animations.\n\n## Usage\n\nDescribe the animation you want.\n\n## Requirements\n\nA configured model provider."
      }
    }
  }
}
```

`name` and `description` are not repeated under `i18n.en` here because `plugin.json` already
declares them as `%key%` placeholders backed by `locales/en.json`.
