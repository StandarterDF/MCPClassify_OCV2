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
// connect/disconnect that server through the V2 client API (`experimental.mcp`;
// see `client.js` for the resolution order). Server names and tool names are
// never touched.
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
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { buildClasses, groupServers, DEFAULT_CLASS } from "./classes.js"
import { isMcpActionAvailable, mcpUnavailableMessage, resolveMcpApi } from "./client.js"

// Storage key for the root "MCP" disclosure; `$` keeps it clear of class names.
const ROOT_KEY = "$mcp"

// A connection that stays `pending` longer than this is treated as stalled and
// shown as "Timeout". The runtime's own start-up timeout is 30 s, so 45 s is
// generous headroom (long MCP servers can take ~20 s to initialize).
const STALL_MS = 45_000

// While a connect/disconnect call is in flight, re-read the MCP list at this
// interval. `mcp.status.changed` normally does that, but a missed event must
// not leave the row on "Connecting" forever.
const REFRESH_MS = 1_500

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
  // Servers whose connect/disconnect call is in flight: name -> startedAt.
  const [loading, setLoading] = createSignal(new Map())
  // Servers the runtime reports as `pending`: name -> when that was first seen.
  // Plain map + tick signal: no reactive churn while statuses are stable.
  const pendingSince = new Map()
  const [pendingTick, setPendingTick] = createSignal(0)
  // Clock used by the elapsed/stalled checks; ticks once a second while busy.
  const [clock, setClock] = createSignal(Date.now())
  // Timers created by row actions, cleared when the sidebar goes away.
  const timers = new Set()
  onCleanup(() => {
    for (const timer of timers) clearInterval(timer)
    timers.clear()
  })

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
  const since = (name) => Math.min(loading().get(name) ?? Infinity, pendingSince.get(name) ?? Infinity)
  const stalled = (name) => {
    const started = since(name)
    return Number.isFinite(started) && clock() - started >= STALL_MS
  }

  // Remember when a server entered `pending`, so a start that never finishes
  // can be shown as "Timeout" instead of an endless "Connecting".
  createEffect(() => {
    const list = servers()
    const seen = new Set()
    let changed = false
    for (const server of list) {
      if (server.status.status !== "pending") continue
      seen.add(server.name)
      if (!pendingSince.has(server.name)) {
        pendingSince.set(server.name, Date.now())
        changed = true
      }
    }
    for (const name of [...pendingSince.keys()]) {
      if (seen.has(name)) continue
      pendingSince.delete(name)
      changed = true
    }
    if (changed) setPendingTick((tick) => tick + 1)
  })

  // Tick the clock once a second while something is connecting.
  createEffect(() => {
    pendingTick()
    if (loading().size === 0 && pendingSince.size === 0) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  // Force the data layer to re-read MCP status for `target`. Failures are
  // ignored: `mcp.status.changed` usually gets there first.
  const refresh = (target) => {
    const api = context.data.location.mcp.server
    try {
      api.invalidate(target)
      if (typeof api.sync === "function") {
        void Promise.resolve(api.sync(target)).catch(() => undefined)
      }
    } catch {
      // Ignore; the next event or sidebar re-render will refresh the list.
    }
  }

  // Connect when not connected, disconnect when connected. The runtime sets
  // the status to `pending` and publishes `mcp.status.changed`, but the list is
  // also polled while the call is in flight so the row cannot stay stuck on
  // "Connecting" if that event is missed.
  const toggleServer = (server) => {
    const name = server.name
    if (isLoading(name)) return
    const status = server.status.status
    // Leave an in-progress start alone; only allow a retry once it is stalled.
    if (status === "pending" && !stalled(name)) return

    // OpenCode 2.2.5 dropped `client.api`; the generated client exposes MCP
    // under `experimental.mcp` (with deprecated aliases). Resolve it once, and
    // fail with a readable toast if this build has no usable API.
    const api = resolveMcpApi(context.client)
    if (!isMcpActionAvailable(api)) {
      context.ui.toast.show({
        message: `${name}: ${mcpUnavailableMessage()}`,
        variant: "error",
      })
      return
    }

    const target = location()
    const input = { server: name, location: { directory: target?.directory } }
    let call
    try {
      call =
        status === "connected"
          ? api.disconnect(input)
          : api.connect(input)
    } catch (error) {
      context.ui.toast.show({
        message: `${name}: ${error?.message ?? error}`,
        variant: "error",
      })
      return
    }

    setLoading((prev) => new Map(prev).set(name, Date.now()))
    // Restart the stall clock for this server so a retry shows "Connecting"
    // again instead of staying on "Timeout" from the previous attempt.
    pendingSince.delete(name)

    let done = false
    const poll = setInterval(() => refresh(target), REFRESH_MS)
    const watchdog = setTimeout(finish, STALL_MS)
    timers.add(poll)
    timers.add(watchdog)
    function finish() {
      if (done) return
      done = true
      clearInterval(poll)
      clearTimeout(watchdog)
      timers.delete(poll)
      timers.delete(watchdog)
      refresh(target)
      setLoading((prev) => {
        const next = new Map(prev)
        next.delete(name)
        return next
      })
    }

    Promise.resolve(call)
      .catch((error) =>
        context.ui.toast.show({
          message: `${name}: ${error?.message ?? error}`,
          variant: "error",
        }),
      )
      .then(finish, finish)
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
                      const stuck = () => pending() && stalled(item.name)
                      const tone = () =>
                        stuck()
                          ? theme.text.feedback.warning.base
                          : pending()
                            ? theme.text.muted
                            : statusColor(status())
                      return (
                        <box
                          flexDirection="row"
                          gap={1}
                          minWidth={0}
                          paddingLeft={2}
                          onMouseDown={() => toggleServer(item)}
                        >
                          <text
                            flexShrink={0}
                            style={{
                              fg: stuck()
                                ? theme.text.feedback.warning.base
                                : pending()
                                  ? theme.text.muted
                                  : dot(status()),
                            }}
                          >
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
                          <text fg={tone()} wrapMode="none" flexShrink={0}>
                            {pending() ? (stuck() ? "Timeout" : "Connecting") : statusText(status())}
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
