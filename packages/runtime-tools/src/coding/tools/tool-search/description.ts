export const TOOL_SEARCH_TOOL_DESCRIPTION = `Search the deferred MCP tool index by keyword and activate matching tools.

When many MCP tools are configured, most are not loaded into your tool list up front — only an index of names and one-line descriptions appears in the system prompt. Call this tool with keywords (tool name fragments, server name, or capability words like "page", "database", "issue") to activate the best matches; their full schemas become callable from the next turn on.

Guidance:
- Prefer keywords copied from the MCP tool index in the system prompt.
- When the user names a specific MCP server or tool, search for that name.
- Activation persists for the rest of the session; there is no need to re-search for tools already activated.
- If nothing matches, retry with broader or different keywords before telling the user the capability is unavailable.`;
