# Bootstrap: Fill Project Development Guidelines

## Purpose

Welcome to Trellis! This is your first task.

AI agents use `.trellis/spec/` to understand YOUR project's coding conventions.
**Starting from scratch = AI writes generic code that doesn't match your project style.**

Filling these guidelines is a one-time setup that pays off for every future AI session.

---

## Your Task

Fill in the guideline files based on your **existing codebase**.

### Package: @mariozechner/pi-ai (`spec/pi-ai/`)

- Backend guidelines: `.trellis/spec/pi-ai/backend/`

- Frontend guidelines: `.trellis/spec/pi-ai/frontend/`

### Package: @mariozechner/pi-agent-core (`spec/pi-agent-core/`)

- Backend guidelines: `.trellis/spec/pi-agent-core/backend/`

- Frontend guidelines: `.trellis/spec/pi-agent-core/frontend/`

### Package: @vetta/coding-agent (`spec/coding-agent/`)

- Backend guidelines: `.trellis/spec/coding-agent/backend/`

- Frontend guidelines: `.trellis/spec/coding-agent/frontend/`

### Package: @vetta/runtime-core (`spec/runtime-core/`)

- Backend guidelines: `.trellis/spec/runtime-core/backend/`

- Frontend guidelines: `.trellis/spec/runtime-core/frontend/`

### Package: @vetta/runtime-tools (`spec/runtime-tools/`)

- Backend guidelines: `.trellis/spec/runtime-tools/backend/`

- Frontend guidelines: `.trellis/spec/runtime-tools/frontend/`

### Package: @vetta/runtime-mcp (`spec/runtime-mcp/`)

- Backend guidelines: `.trellis/spec/runtime-mcp/backend/`

- Frontend guidelines: `.trellis/spec/runtime-mcp/frontend/`

### Package: @vetta/runtime-storage (`spec/runtime-storage/`)

- Backend guidelines: `.trellis/spec/runtime-storage/backend/`

- Frontend guidelines: `.trellis/spec/runtime-storage/frontend/`

### Package: @vetta/runtime-telemetry (`spec/runtime-telemetry/`)

- Backend guidelines: `.trellis/spec/runtime-telemetry/backend/`

- Frontend guidelines: `.trellis/spec/runtime-telemetry/frontend/`

### Package: @vetta/cli-app (`spec/cli-app/`)

- Backend guidelines: `.trellis/spec/cli-app/backend/`

- Frontend guidelines: `.trellis/spec/cli-app/frontend/`

### Package: @vetta/desktop-app (`spec/desktop-app/`)

- Frontend guidelines: `.trellis/spec/desktop-app/frontend/`

### Package: @mariozechner/pi-tui (`spec/pi-tui/`)

- Backend guidelines: `.trellis/spec/pi-tui/backend/`

- Frontend guidelines: `.trellis/spec/pi-tui/frontend/`

### Package: @mariozechner/pi-web-ui (`spec/pi-web-ui/`)

- Backend guidelines: `.trellis/spec/pi-web-ui/backend/`

- Frontend guidelines: `.trellis/spec/pi-web-ui/frontend/`

### Package: pi-web-ui-example (`spec/pi-web-ui-example/`)

- Frontend guidelines: `.trellis/spec/pi-web-ui-example/frontend/`

### Package: pi-extension-with-deps (`spec/pi-extension-with-deps/`)

- Frontend guidelines: `.trellis/spec/pi-extension-with-deps/frontend/`

### Package: pi-extension-custom-provider-anthropic (`spec/pi-extension-custom-provider-anthropic/`)

- Frontend guidelines: `.trellis/spec/pi-extension-custom-provider-anthropic/frontend/`

### Package: pi-extension-custom-provider-gitlab-duo (`spec/pi-extension-custom-provider-gitlab-duo/`)

- Frontend guidelines: `.trellis/spec/pi-extension-custom-provider-gitlab-duo/frontend/`

### Package: pi-extension-custom-provider-qwen-cli (`spec/pi-extension-custom-provider-qwen-cli/`)

- Frontend guidelines: `.trellis/spec/pi-extension-custom-provider-qwen-cli/frontend/`


### Thinking Guides (Optional)

The `.trellis/spec/guides/` directory contains thinking guides that are already
filled with general best practices. You can customize them for your project if needed.

---

## How to Fill Guidelines

### Step 0: Import from Existing Specs (Recommended)

Many projects already have coding conventions documented. **Check these first** before writing from scratch:

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

If any of these exist, read them first and extract the relevant coding conventions into the corresponding `.trellis/spec/` files. This saves significant effort compared to writing everything from scratch.

### Step 1: Analyze the Codebase

Ask AI to help discover patterns from actual code:

- "Read all existing config files (CLAUDE.md, .cursorrules, etc.) and extract coding conventions into .trellis/spec/"
- "Analyze my codebase and document the patterns you see"
- "Find error handling / component / API patterns and document them"

### Step 2: Document Reality, Not Ideals

Write what your codebase **actually does**, not what you wish it did.
AI needs to match existing patterns, not introduce new ones.

- **Look at existing code** - Find 2-3 examples of each pattern
- **Include file paths** - Reference real files as examples
- **List anti-patterns** - What does your team avoid?

---

## Completion Checklist

- [ ] Guidelines filled for your project type
- [ ] At least 2-3 real code examples in each guideline
- [ ] Anti-patterns documented

When done:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

---

## Why This Matters

After completing this task:

1. AI will write code that matches your project style
2. Relevant `/trellis:before-*-dev` commands will inject real context
3. `/trellis:check-*` commands will validate against your actual standards
4. Future developers (human or AI) will onboard faster
