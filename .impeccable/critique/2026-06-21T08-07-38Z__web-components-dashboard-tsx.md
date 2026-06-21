---
target: list screen + memory card
total_score: 31
p0_count: 0
p1_count: 3
timestamp: 2026-06-21T08-07-38Z
slug: web-components-dashboard-tsx
---
# Critique — list screen + memory card (web)

Design system: Norn dark "well of memory" (CLAUDE.md + globals.css tokens). Register: product.

## Design Health: 31/40 (Good) — post-polish

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of status | 3 | result count + undo status present |
| 2 | Match real world | 4 | Recall/Remember/Forget verbs |
| 3 | User control/freedom | 3 | clear search, undo, Esc, no edit yet |
| 4 | Consistency | 4 | tokens, one radius, shadcn |
| 5 | Error prevention | 3 | forget recoverable via undo |
| 6 | Recognition | 3 | visible projects/tags, touch menu |
| 7 | Flexibility | 3 | Cmd+K, "/" focus |
| 8 | Aesthetic/minimal | 4 | quiet, one accent |
| 9 | Error recovery | 3 | undo + no-results recovery |
| 10 | Help/docs | 1 | none |

## Anti-patterns
LLM: no slop tells; disciplined dark editorial, single accent. Detector: clean (0 findings).

## Priority issues (found, now fixed)
- [P1] Cmd+K hint was a dead promise -> wired global Cmd+K / "/" focus + Esc clear.
- [P1] Empty-state copy wrong when filtered to zero -> distinct no-results state + Clear search.
- [P1] Forget was one-click permanent, no recovery -> undo affordance (6s, aria-live).
- [P2] Overflow menu hover-only -> always visible under md (touch discoverable).
- [P2] No clear-search control -> X button + Esc.

## Remaining (out of polish scope)
- Remember/Edit have no compose flow yet (feature, not polish).
- No help/tooltips (heuristic 10).
- Not yet wired to @norn/core data.
