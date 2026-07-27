# @vetta/runtime-storage

Storage implementations and compatibility exports for Agent hosts.

The root entry temporarily preserves the existing coding-agent Auth, Session and
Settings exports. New conversation persistence is owned by this package and
available from `@vetta/runtime-storage/conversation`.

## What It Owns

- session storage exports
- auth storage exports
- settings storage exports
- versioned file Conversation Repository
- strict native Conversation V1/V2 reading and V2 document-entry envelopes
- read-only Legacy v1-v3 Session JSONL import into the Runtime Conversation Document
- TypeBox runtime validation for persisted conversation records
- stable absolute conversation path resolution for runtime session identity

## What It Does Not Own

- host-specific file selection or path permissions
- application UI
- business data models

## Who Depends On It

- runtime hosts and embedded apps that need storage without importing deep `coding-agent` internals

## Main Exports

- compatibility storage exports from the package root
- `FileConversationRepository` and stable storage errors from
  `@vetta/runtime-storage/conversation`
- `FileConversationRepository.resolveConversationPath()` for composition-owned identity metadata
- `FileConversationRepository.readDocument()` and `LegacySessionDocumentReader` for native and Legacy history reads
