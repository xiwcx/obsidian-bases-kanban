---
'kanban-bases-view': patch
---

Reduce drag stalls on large boards by avoiding redundant DOM moves, using linear saved-order lookup, and disabling card animations above 100 cards per cell.
