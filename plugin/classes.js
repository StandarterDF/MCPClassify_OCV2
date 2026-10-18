// Class-based grouping for MCP servers. Pure logic, no OpenCode imports, so it
// can be unit-tested with plain Node (see tmp/test-classes.mjs).

export const DEFAULT_CLASS = "Other"

// Classes for the MCP servers that ship in a typical global opencode.json.
// `options.classes` merges over this map: a class replaces its own list, a
// `null` value removes the class.
export const DEFAULT_CLASSES = {
  WebSearch: ["searxng", "tavily", "deepseek-search"],
  Browser: ["playwright", "chrome-devtools"],
  Messaging: ["TelegramMCP"],
  Documents: ["markitdown"],
  System: ["windows-mcp"],
  CAD: ["freecad"],
}

// Build the class map: label -> Set of lowercased member server names.
// Insertion order is the display order of the classes.
export function buildClasses(options) {
  const merged = { ...DEFAULT_CLASSES }
  const override = options && typeof options.classes === "object" ? options.classes : null
  if (override) {
    for (const [label, list] of Object.entries(override)) {
      if (list === null) {
        delete merged[label]
        continue
      }
      if (Array.isArray(list)) merged[label] = list
    }
  }

  const map = new Map()
  for (const [label, list] of Object.entries(merged)) {
    const members = new Set(
      (Array.isArray(list) ? list : [])
        .filter((name) => typeof name === "string" && name.length > 0)
        .map((name) => name.toLowerCase()),
    )
    map.set(label, members)
  }
  return map
}

// Class of a server name, or undefined when it matches no class.
export function classify(name, classes) {
  const lower = String(name).toLowerCase()
  for (const [label, members] of classes) {
    if (members.has(lower)) return label
  }
  return undefined
}

// Group servers by class. Returns ordered [label, servers[]] pairs: the
// configured classes first (in map order), any extra class next, and the
// default class ("Other") last. Empty classes are dropped, servers are sorted
// by name.
export function groupServers(servers, classes, defaultClass = DEFAULT_CLASS) {
  const buckets = new Map()
  for (const server of servers) {
    const label = classify(server.name, classes) ?? defaultClass
    const list = buckets.get(label)
    if (list) list.push(server)
    else buckets.set(label, [server])
  }

  const known = []
  for (const label of classes.keys()) {
    if (label !== defaultClass && buckets.has(label)) known.push(label)
  }
  for (const label of buckets.keys()) {
    if (label !== defaultClass && !known.includes(label)) known.push(label)
  }

  const order = [...known]
  if (buckets.has(defaultClass)) order.push(defaultClass)

  return order.map((label) => [
    label,
    buckets
      .get(label)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  ])
}
