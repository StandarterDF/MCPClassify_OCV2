// McpClassify — OpenCode V2 TUI plugin.
//
// Replaces the built-in flat "MCP" sidebar section with a nested, collapsible
// one:
//
//   MCP (N)              <- root, collapsible, N = total servers
//     WebSearch (N1)     <- class, collapsible, N1 = servers in the class
//       searxng          Connected
//       tavily           Disabled
//     Browser (N2)
//     ...
//     Other (Nk)         <- always last
//
// Click a class/root heading to collapse or expand it. Click a server row to
// connect/disconnect that server (same API the built-in MCP dialog uses).
// Server names and tool names are never touched.
//
// The built-in section (`opencode.sidebar.mcp`) must be turned off, otherwise
// both would render. Put this in `cli.json` (CLI-only config, not
// opencode.json):
//
//   { "plugins": ["-opencode.sidebar.mcp"] }
//
// Classes come from `options.classes`, merged over the defaults in
// `classes.js`. No network access.

import { Plugin } from "@opencode/plugin/tui"
import { For, Show, createMemo, createSignal } from "solid-js"
import { buildClasses, groupServers, DEFAULT_CLASS } from "./classes.js"

// Storage key for the root "MCP" disclosure; `$` keeps it clear of class names.
const ROOT_KEY = "$mcp"

function statusText(status) {
  if (status === "connected") return "Connected"
  if (status === "pending") return "Connecting"
  if (status === "failed") return "Error"
  if (status === "needs_auth") return "Sign in"
  return "Disabled"
}

function McpClasses(props) {
  const context = props.context
  const theme = context.theme
  // Persisted collapse state: { [label]: false } means collapsed.
  const [view, updateView] = context.storage.store("classes", { initial: {} })
  // Servers whose connect/disconnect call is in flight.
  const [loading, setLoading] = createSignal(new Set())

  const location = createMemo(() => {
    const session = context.data.session.get(props.sessionID)
    return session?.location ?? context.data.location.default()
  })

  const servers = createMemo(() => context.data.location.mcp.server.list(location()) ?? [])

  const groups = createMemo(() => groupServers(servers(), props.classes, props.defaultClass))

  const isOpen = (label) => view[label] !== false
  const toggle = (label) => {
    void updateView((draft) => {
      draft[label] = !isOpen(label)
    }).catch(() => undefined)
  }

  const isLoading = (name) => loading().has(name)

  // Connect when not connected, disconnect when connected. The
  // `mcp.status.changed` event refreshes the list automatically.
  const toggleServer = (server) => {
    const name = server.name
    if (isLoading(name) || server.status.status === "pending") return
    setLoading((prev) => new Set(prev).add(name))
    const target = location()
    const input = { server: name, location: { directory: target?.directory } }
    const call =
      server.status.status === "connected"
        ? context.client.api.mcp.disconnect(input)
        : context.client.api.mcp.connect(input)
    Promise.resolve(call)
      .catch((error) =>
        context.ui.toast.show({
          message: `${name}: ${error?.message ?? error}`,
          variant: "error",
        }),
      )
      .finally(() =>
        setLoading((prev) => {
          const next = new Set(prev)
          next.delete(name)
          return next
        }),
      )
  }

  const dot = (status) => {
    if (status === "connected") return theme.text.feedback.success.base
    if (status === "failed") return theme.text.feedback.error.base
    if (status === "needs_auth") return theme.text.feedback.warning.base
    return theme.text.muted
  }

  const statusColor = (status) => {
    if (status === "failed") return theme.text.feedback.error.base
    if (status === "needs_auth") return theme.text.feedback.warning.base
    return theme.text.muted
  }

  const heading = (text, count, open, onToggle) => (
    <box flexDirection="row" gap={1} onMouseDown={onToggle}>
      <text fg={theme.text.base}>{open ? "\u25bc" : "\u25b6"}</text>
      <text fg={theme.text.base}>
        <b>{text}</b>
        <span style={{ fg: theme.text.muted }}>{` (${count})`}</span>
      </text>
    </box>
  )

  return (
    <Show when={servers().length > 0}>
      <box flexDirection="column">
        {heading("MCP", servers().length, isOpen(ROOT_KEY), () => toggle(ROOT_KEY))}
        <Show when={isOpen(ROOT_KEY)}>
          <For each={groups()}>
            {([label, list]) => (
              <box flexDirection="column" paddingLeft={1}>
                {heading(label, list.length, isOpen(label), () => toggle(label))}
                <Show when={isOpen(label)}>
                  <For each={list}>
                    {(item) => {
                      const status = () => item.status.status
                      const pending = () => isLoading(item.name) || status() === "pending"
                      return (
                        <box
                          flexDirection="row"
                          gap={1}
                          minWidth={0}
                          paddingLeft={2}
                          onMouseDown={() => toggleServer(item)}
                        >
                          <text flexShrink={0} style={{ fg: pending() ? theme.text.muted : dot(status()) }}>
                            {"\u2022"}
                          </text>
                          <text
                            fg={theme.text.base}
                            wrapMode="none"
                            truncate
                            flexGrow={1}
                            flexShrink={1}
                            minWidth={0}
                          >
                            <b>{item.name}</b>
                          </text>
                          <text
                            fg={pending() ? theme.text.muted : statusColor(status())}
                            wrapMode="none"
                            flexShrink={0}
                          >
                            {pending() ? "Connecting" : statusText(status())}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </Show>
              </box>
            )}
          </For>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.mcp-classify",
  setup(context) {
    const options = context.options ?? {}
    const classes = buildClasses(options)
    const defaultClass =
      typeof options.defaultClass === "string" && options.defaultClass.length > 0
        ? options.defaultClass
        : DEFAULT_CLASS

    context.ui.slot({
      append: "sidebar.content",
      render: (input) => (
        <McpClasses
          context={context}
          sessionID={input.sessionID}
          classes={classes}
          defaultClass={defaultClass}
        />
      ),
    })
  },
})
