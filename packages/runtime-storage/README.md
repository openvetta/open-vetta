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
- TypeBox runtime validation for persisted conversation records

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
