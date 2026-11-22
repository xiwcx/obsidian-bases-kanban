# Changelog

## 0.11.0

### Minor Changes

- 654de72: Render Markdown links in plain-text card properties using Obsidian's Markdown renderer.
- c1e1733: Add independent ascending and descending sorting for columns and swimlanes while preserving saved manual orders. Keep Base sorting for cards within each cell.
- 09a202b: Keep saved empty swimlanes as drop targets, with an option to hide them without discarding their saved order.
- 88aaec9: Collapse columns into narrow pills, sharing state across swimlanes and persisting it per grouping property.

### Patch Changes

- 88aaec9: Unify column header controls, use native trash icons for empty columns, and add vertical padding to narrow collapsed rails.
- 917bbc3: Preserve native localized date rendering and remove bulky date-input styling in Kanban cards. Allow date values to wrap below their labels instead of squeezing them.

## 0.10.8

### Patch Changes

- 4271878: Reject unsupported dragging between separate Kanban views instead of showing a move that was never saved.
- 4f43dd4: Preserve hidden cards' saved positions when dragging with a search or filter active.
- 158ac9e: Ask for confirmation before removing an empty column, explaining the effect on embedded views and preserving configuration when dismissed.
- 15d8a6f: Reduce drag stalls on large boards by avoiding redundant DOM moves, using linear saved-order lookup, and disabling card animations above 100 cards per cell.

## 0.10.7

### Patch Changes

- ca0d757: Prevent quick-add from leaving nested folder trees by passing Bases a bare filename and retaining the configured-folder placement fallback.
- a39ac1e: Resolve wikilink aliases and basenames in column and swimlane titles.

Changesets will record releases here starting with the next release. Earlier release notes remain available on [GitHub Releases](https://github.com/xiwcx/obsidian-bases-kanban/releases).
