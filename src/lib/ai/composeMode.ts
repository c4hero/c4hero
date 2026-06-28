// Guess whether a "Describe" compose prompt is building a NEW model or CHANGING
// the current one, from its verbs. Defaults to "change" when ambiguous (safer —
// "new" replaces the whole workspace), and only "new" on clear build language.
// Pure + unit-tested so the heuristic can evolve without touching the panel.

export function detectComposeMode(text: string): 'new' | 'change' {
  const t = text.toLowerCase()
  const change = /\b(add|change|connect|remove|rename|update|delete|set|move|introduce|split|insert|replace)\b/.test(t)
  const build = /\b(build|create|new model|new system|new diagram|model for|platform with|system with|design a)\b/.test(t)
  // A clear "build/create/design a new …" (or "from scratch") is a brand-new
  // model even when the prompt also lists what to put in it — so this wins over
  // the change verbs that such a description naturally contains. We require a
  // BUILD verb next to "new": a bare "new architecture/model" alternative is too
  // broad — "update my model to a new architecture" must stay a change, since
  // "new" routes to generate which REPLACES the whole workspace (data loss).
  const newIntent = /\b(from scratch|greenfield)\b/.test(t)
    || /\b(build|create|design|generate|make|start)\s+(a\s+|an\s+|the\s+)?new\b/.test(t)
  if (newIntent) return 'new'
  if (build && !change) return 'new'
  return 'change'
}
