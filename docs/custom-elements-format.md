# Canonical Emission Formalization

This document formalizes the canonical output format for C4hero's DSL serializer, specifically detailing the decisions made around custom elements and the "gofmt-style" philosophy applied to the workspace.

## Philosophy: First-Save Reformats
C4hero takes an opinionated "gofmt-style" approach to DSL formatting. We do not attempt to preserve the user's original whitespace, indentation quirks, or syntactic sugar choices (like omitting quotes around safe strings). 

Instead, the first time a user saves their workspace from C4hero, the entire file is rewritten into our canonical format. This eliminates endless formatting debates, simplifies our serializer, and ensures that semantic diffs are clean and predictable moving forward.

## Formatting Rules
The canonical emission format adheres to the following strict rules:

1. **4-Space Indentation:** All nested blocks are indented with exactly four spaces per level.
2. **Quoted Property Names:** All property keys within `properties { ... }` blocks must be enclosed in double quotes (e.g., `"key" "value"`). This prevents syntax errors with keys containing spaces or special characters.
3. **Explicit Include Lists:** We do not rely on implicit includes or globbing for views. All elements and relationships present in a view are explicitly listed in the view's definition.

## Expected-Output Freeze
To guarantee the stability of roundtrip parsing and serialization (especially for our integration tests), we have recorded an **Expected-Output Freeze**.
The canonical string emitted by `serializeDSL()` is considered the absolute source of truth. Any structural mutation that alters this byte-for-byte output must be treated as a breaking change to the format and requires updating the frozen integration tests.

For Custom Elements, this specifically means:
* They are serialized with their `metadata` if present.
* They are emitted in deterministic order based on their declaration and relationships.
* Their IDs may be normalized (e.g. `rel-1`) during the parsing phase, and the canonical output reflects this normalized state.
