// McpClassify — server-side companion.
//
// All the work happens in the TUI plugin (`tui.tsx`): it groups the sidebar
// MCP list by class. This server entry exists only so the plugin directory is
// a well-formed package and shows up in `opencode plugin list`. It touches
// nothing: server names, tool names, and MCP configuration stay as configured.

export default {
  id: "opencode.mcp-classify",

  setup() {
    // Intentionally empty.
  },
}
