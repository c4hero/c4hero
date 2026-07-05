// Guess whether a "Describe" compose prompt is building a NEW model (which
// REPLACES the whole workspace) or CHANGING the current one.
//
// IMPORTANT: this is only consulted when a workspace already EXISTS (the caller
// uses `!workspace ? 'new' : detectComposeMode(text)`). In that context the user
// almost always means to extend what they have, and a wrong 'new' wipes their
// model — so we default hard to 'change' and only return 'new' on an explicit
// "start fresh / new model" intent. The Describe UI also confirms before loading
// over a non-empty workspace, as a second line of defence.
// Pure + unit-tested so the heuristic can evolve without touching the panel.

// Nouns that denote the WHOLE model (vs. an element, a view, or a sub-diagram).
// Deliberately narrow: "model"/"workspace" unambiguously mean the entire thing,
// whereas "a new architecture/diagram/system landscape" is usually an addition
// to the current model, so those stay a 'change' (and the UI confirms a replace
// anyway).
const MODEL_NOUN = '(model|workspace)'

// A question the assistant should ANSWER (grounded Q&A) rather than an instruction
// to edit the model. Matches a trailing '?', or an opening interrogative / auxiliary
// / "explain|summarize". Deliberately conservative: edit verbs (add/create/remove/
// rename/connect/split/…) never lead a question, so instructions keep the plan path.
// Pure + unit-tested. The caller only treats input as a question when a workspace
// exists to ground the answer on.
const QUESTION_LEAD = /^(what|which|who|whom|whose|where|when|why|how|is|are|am|do|does|did|can|could|should|would|will|has|have|had|explain|summar\w*)\b/i

export function isQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return t.endsWith('?') || QUESTION_LEAD.test(t)
}

export function detectComposeMode(text: string): 'new' | 'change' {
  const t = text.toLowerCase()
  const replace =
    /\b(from scratch|greenfield|start over|start fresh|start again)\b/.test(t)
    // "replace the/my model", "replace everything", …
    || new RegExp(`\\breplace\\b[^.!?\\n]*\\b(model|diagram|workspace|architecture|everything)\\b`).test(t)
    // "build/create/design a new model", "generate a new workspace", …
    // Requires a BUILD verb so additive phrasing like "add a new model for auth"
    // (leading verb "add") stays a change. Deliberately excludes "update"/"model"
    // as verbs so "update my model to a new model" stays a change too.
    || new RegExp(`\\b(build|create|generate|make|design)\\b[^.!?\\n]*\\bnew\\b[^.!?\\n]*\\b${MODEL_NOUN}\\b`).test(t)
  return replace ? 'new' : 'change'
}
