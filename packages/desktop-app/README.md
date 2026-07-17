# @vetta/desktop-app

Electron desktop host for the Vetta runtime.

## What It Owns

- Electron main/preload/renderer wiring
- desktop-specific IPC bridges
- file explorer, scheduler, project, and chat renderer domains
- integration of runtime packages into a desktop shell

## What It Does Not Own

- provider protocol implementations
- core agent loop logic
- business backend rules

## Who Depends On It

- end users running the desktop application

## Internal Boundaries

- `src/main`: Electron main process and native capabilities
- `src/preload`: safe bridge surface for the renderer
- `src/renderer`: React application domains and UI

## Development

Run `bun dev` from this package after installing the monorepo dependencies. The development startup
builds changed workspace prerequisites, stages plugin and theme manifests, then starts the renderer,
theme server, and Electron process in parallel.

Main-process sourcemaps are disabled by default to keep startup builds fast. Set
`VETTA_MAIN_SOURCEMAP=1` when source-mapped Electron stack traces are needed.
