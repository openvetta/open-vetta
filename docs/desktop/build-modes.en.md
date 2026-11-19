# Build Modes and Environment Variables

*[中文](./build-modes.md)*

Vetta Desktop ships in one form: **it never talks to a Vetta server** (serv-less). Account login, subscriptions and credits, the cloud ability marketplace, and the remote model catalog are gone; see [ADR-0156](../adr/0156-desktop-drops-vetta-serv.md).

Everything the client needs runs locally: local sessions, the coding agent, the plugin system, themes, bring-your-own-key models, the IM gateway, the knowledge base, and an ability marketplace served from GitHub repositories.

Ability sources come only from GitHub repositories and the local install state. A distribution registers an optional built-in
source only when `VETTA_OPEN_MARKETPLACE_REPOSITORY` is explicitly configured; unset, empty, or whitespace-only means
no registration, and there is no hard-coded repository fallback.
Under Abilities → Marketplace sources, users can add multiple GitHub repositories and independently enable,
auto-update, or refresh each source. A failing source does not block others. Same-name abilities retain their
source identities; physical installation conflicts still require explicit resolution instead of silent overwrites.

`VETTA_OPEN_MARKETPLACE_REPOSITORY` optionally declares the distribution's built-in source.
Removing it does not delete persisted sources or uninstall abilities; existing sources can be disabled in the UI.
Adding sources through the UI does not require rebuilding. Normally omit `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL`
so it follows the repository and ref. Restart development processes after editing environment files;
subsequent repository content changes only require Refresh. See [GitHub marketplace format](../open-marketplace.md)
for source and upgrade semantics.

---

## Building a package

Windows, macOS, and Linux use the same entry point. It selects the host platform and uses updates from the `openvetta/open-vetta` GitHub Releases page. GitHub ability sources come only from environment configuration, not script defaults.

```bash
cd apps/desktop
bun run dist:opensource
```

To create an unpacked directory for verification:

```bash
bun run dist:opensource -- --target dir
```

Forks can override GitHub and marketplace coordinates in `apps/desktop/.env.opensource`:

```bash
VETTA_UPDATE_GITHUB_OWNER=your-org
VETTA_UPDATE_GITHUB_REPO=your-fork
VETTA_OPEN_MARKETPLACE_REPOSITORY=your-org/your-marketplace
```

Build environments reject `VETTA_SERVER_URL` and `VETTA_SITE_URL`: login, the official marketplace, and the remote model catalog are absent from the bundle, and setting them fails the pre-flight check.

## Environment files

No `.env.*` file is tracked in git. `apps/desktop/.env.example` is the variable index — copy it to `.env.development` and edit.

When packaging, `VETTA_BUILD_ENV=<mode>` selects which `.env.<mode>` to load:

```bash
VETTA_BUILD_ENV=production bun run pack     # reads .env.production
bun run pack:test                           # same as VETTA_BUILD_ENV=test
```

Precedence: **inline on the command line > process environment > `.env.<mode>` > `.env` > code defaults**.

### Reference: a typical `.env.production`

This is what our team uses for official releases. Your production endpoint, update source and tenant are almost certainly different:

```bash
VETTA_UPDATE_PROVIDER=generic
VETTA_UPDATE_URL=https://releases.openvetta.com/desktop/stable
VETTA_R2_BUCKET=vetta-releases
VETTA_R2_PREFIX=desktop/stable
VETTA_TENANT=common
VETTA_SPEECH_INPUT_ENABLED=false
```

### Reference: a typical `.env.test`

```bash
# The default provider is stable; override VETTA_UPDATE_URL for a dedicated test feed.
VETTA_UPDATE_PROVIDER=generic
VETTA_UPDATE_URL=https://releases.openvetta.com/desktop/test
```

---

## Variable reference

### Marketplace sources

| Variable | Description |
| --- | --- |
| `VETTA_OPEN_MARKETPLACE_REPOSITORY` | Optional built-in GitHub source; empty means no registration, with no default repository address |
| `VETTA_OPEN_MARKETPLACE_REF` | Branch or tag, defaults to `main` |
| `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL` | Explicit archive URL; derived from repository and ref when omitted |

### Build-time trimming

| Variable | Description |
| --- | --- |
| `VETTA_SPEECH_INPUT_ENABLED` | `false` excludes the speech models, the Sherpa native runtime and the speech entry point. Enabled by default |
| `VETTA_TENANT` | System-plugin tenant, decides which presets get packaged. See `packages/plugins/tenants.json` |
| `VETTA_BUILD_ENV` | Selects which `.env.<mode>` to load |

### Development toggles

| Variable | Description |
| --- | --- |
| `VETTA_SHOW_UI_THEME` | `true` reveals the "UI theme" section in appearance settings |

### Auto-update

| Variable | Description |
| --- | --- |
| `VETTA_UPDATE_PROVIDER` | `github` for official releases, `generic` for your own feed |
| `VETTA_UPDATE_URL` | For `generic`: R2, self-hosted object storage, or any static HTTP/CDN root |
| `VETTA_UPDATE_GITHUB_OWNER` · `VETTA_UPDATE_GITHUB_REPO` | For `github` |
| `VETTA_R2_BUCKET` · `VETTA_R2_PREFIX` | R2 upload target, used only by `publish:updates:r2` |

The update source is build configuration and is independent of the operating system; switching providers requires no client code changes. Platform details: [macOS](./macos-auto-update.md), [Windows](./windows-auto-update.md).

### Observability

| Variable | Description |
| --- | --- |
| `VETTA_SENTRY_DSN` | Sentry is a no-op when unset. The DSN ends up in the bundle |
| `VETTA_SENTRY_RELEASE` | Immutable release; must match exactly between runtime and source-map upload. Suggested: `vetta-desktop@<version>+<build-id>` |
| `VETTA_TELEMETRY_ENVIRONMENT` | `development` / `staging` / `production` |
| `VETTA_SENTRY_TRACES_SAMPLE_RATE` | 0–1, defaults to 0 |
| `VETTA_SENTRY_ORG` · `VETTA_SENTRY_PROJECT` · `VETTA_SENTRY_URL` | Source-map upload (CI only); `URL` is for self-hosted Sentry only |
| `VETTA_MAIN_SOURCEMAP` | Emit a main-process source map for local stack debugging without uploading |
| `VETTA_POSTHOG_KEY` | Project API Key (starts with `phc_`), **not** a Personal API Key. Ends up in the renderer bundle |
| `VETTA_POSTHOG_HOST` | Defaults to PostHog Cloud US |
| `VETTA_POSTHOG_REPLAY_ENABLED` · `VETTA_POSTHOG_REPLAY_SAMPLE_RATE` | Replay is off by default |
| `VETTA_TRACING` | Set to `langfuse` to trace agent / LLM / tool calls end to end |
| `VETTA_TRACING_TRACE_NAME` · `LANGFUSE_PUBLIC_KEY` · `LANGFUSE_BASE_URL` | Langfuse configuration |
| `LANGFUSE_TRACING_ENVIRONMENT` · `LANGFUSE_RELEASE` · `OTEL_SERVICE_NAME` | Optional metadata |

---

## Secrets

**Never put these in any `.env` file.** Inject them through the shell environment or CI secrets:

- **Cloudflare R2 upload credentials**: `VETTA_R2_ACCOUNT_ID`, `VETTA_R2_ACCESS_KEY_ID`, `VETTA_R2_SECRET_ACCESS_KEY`
- **macOS signing and notarization**: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_API_*`
  CI variants: `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  Set none of them and you get an unsigned package; to sign, all of them are required. See [apple-code-signing.md](../deploy/apple-code-signing.md)
- **Sentry source-map upload**: `VETTA_SENTRY_AUTH_TOKEN`
- **Langfuse**: `LANGFUSE_SECRET_KEY`

`VETTA_REQUIRE_MAC_SIGNATURE=1` is only used by the macOS CI artifact verification step; it is not client configuration.

---

## CI

`.github/workflows/desktop-release.yml` resolves build configuration in the `prepare` job, which uses the `desktop-production` Environment. Precedence:

1. **Actions → desktop-release → Run workflow form** (`workflow_dispatch` only; `default` / empty means no override)
2. **Environment / repository Variables** (when the job sets `environment: desktop-production`, Environment values overlay same-named repository variables)
3. Built-in defaults: `VETTA_RELEASE_TARGET=github` publishes to GitHub Releases

The `VETTA_OPEN_MARKETPLACE_REPOSITORY` Variable declares the built-in GitHub source, optionally overridden by the
`marketplace_repository` input on manual runs. If neither is configured, no GitHub source is bundled.
To include the official source in a distribution, set the Variable to
`https://github.com/openvetta/vetta-official-marketplace`; no code changes are needed.

**A fork with no Variables set produces a shippable build.** Official releases put these on Settings → Environments → `desktop-production` → Environment variables (credentials stay in Environment secrets):

```
VETTA_RELEASE_TARGET = github
VETTA_UPDATE_PROVIDER = github
```

Optional: `VETTA_UPDATE_URL_TEST` / `VETTA_R2_PREFIX_TEST` (and `_STABLE`). Choosing channel `test` on a manual run prefers those; otherwise a trailing `stable` / `test` / `beta` / `prod` / `production` segment is rewritten.

The form can override the tenant, speech input, publish target, and channel. **Do not type R2 keys, certificates, or DSNs into the form** — those stay in Secrets.

The release matrix waits for a dedicated quality job first: the root `bun run check`, quality-script tests, and Desktop packaging contract tests must pass before any platform build starts. Each platform then verifies updater metadata, hashes, blockmaps, and installable contents.

`workflow_dispatch` only builds and keeps an Actions artifact, and prints the resolved config on the job summary; it does not verify a live update feed. Only a release tag matching the `package.json` version publishes to R2 / GitHub Releases. After publishing, the workflow checks `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and every referenced artifact through the public URL. The form is visible only after this workflow exists on the repository default branch.
