// Resolver for the MCP connect/disconnect API exposed by the OpenCode V2
// client. Pure module: no OpenCode imports, so it can be unit-tested with plain
// Node (see tmp/test-client.mjs).
//
// OpenCode 2.2.5 removed `client.api`: the generated client now exposes MCP as
// `client.experimental.mcp` and keeps `client.mcp` as a deprecated alias. The
// legacy `client.api.mcp` stays as a last resort for older V2 builds.

// Precedence: experimental.mcp -> deprecated mcp -> legacy api.mcp.
// Returns undefined when the client exposes none of them.
export function resolveMcpApi(client) {
  return client?.experimental?.mcp ?? client?.mcp ?? client?.api?.mcp
}

// True when `api` can actually connect and disconnect servers. Guards against
// partial or renamed shapes, so a missing method becomes a toast instead of a
// TypeError on click.
export function isMcpActionAvailable(api) {
  return Boolean(api) && typeof api.connect === "function" && typeof api.disconnect === "function"
}

// Toast body shown when no usable MCP API was found.
export function mcpUnavailableMessage() {
  return "MCP API недоступна в этой версии OpenCode (нет experimental.mcp)"
}
