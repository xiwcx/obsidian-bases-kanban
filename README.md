# Kanban Bases View Plugin for Obsidian

A kanban-style drag-and-drop custom view for Obsidian Bases that allows you to organize your notes into columns based on any property.

## Demo

<video src="https://github.com/user-attachments/assets/fa75825a-3e8e-4b92-97b9-0216cabde08d" controls width="100%" title="Kanban Bases View Demo - Drag and drop with color themes"></video>

## Features

- **Dynamic Column Generation**: Select any property from your base to generate kanban columns automatically
- **Drag and Drop**: Move cards between columns with smooth animations
- **Quick Add Buttons**: Create new cards directly from a column's `+` button with the column value, and swimlane value when used, filled in automatically
- **Column Reordering**: Drag columns by their handle (⋮⋮) to reorder them to your preference
- **Swimlanes**: Optionally group the board into horizontal lanes using a second property
- **Column Color Themes**: Assign colors to columns using the color picker button for visual categorization
- **Column Order Persistence**: Your column order is saved per property and persists across sessions
- **Property Selection**: Choose which property determines your columns (e.g., "Status", "Priority", "Category")
- **Uncategorized Entries**: Notes without a value for the selected property are automatically grouped in an "Uncategorized" column
- **Property Display**: Selected properties are shown on each card for at-a-glance context
- **Custom Card Titles**: Display a frontmatter property as the card title instead of the file name — useful when files share a common name (e.g., `README.md`) across folders
- **Cover Images**: Show a cover image on each card by picking a frontmatter property — mirrors Obsidian's native Cards view *Image property* with matching fit (cover/contain) and aspect-ratio controls, so one frontmatter field works for both views
- **Column Triggers**: Automatically set or clear frontmatter properties when a card enters a specific column or swimlane — stamp dates, update statuses, or clear fields without manual edits
- **Property Word Wrap**: Toggle property text wrapping on cards to handle long property values
- **Click to Open**: Click any card to open the corresponding note (Cmd/Ctrl+click to open in new tab)
- **Visual Feedback**: Clear visual indicators during drag operations
- **Responsive Design**: Works well on different screen sizes

## Installation

### Manual Installation

1. Download the latest release from the [Releases](../../releases) page
2. Extract the plugin folder to your vault's `.obsidian/plugins/` directory
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

### Development Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/xiwcx/obsidian-bases-kanban-custom-view.git
   cd obsidian-bases-kanban-custom-view
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Link or copy the plugin folder to your vault's `.obsidian/plugins/` directory

## Usage

1. Create or open a Base in Obsidian
2. Add a view and select "Kanban" as the view type
3. Select the property you want to use for columns (e.g., "Status") in the "Group by" option
4. Your notes will be automatically organized into columns based on the selected property's values
5. Drag cards between columns to update the property value
6. Optionally, set "Add card to column folder" to a folder path — this enables a `+` button in each column header for quickly creating cards with that column's value pre-filled
7. Click any card to open the corresponding note (Cmd/Ctrl+click to open in new tab)
8. Drag columns by their handle (⋮⋮) to reorder them - your preferred order will be saved
9. Optionally, select a property in "Swimlane by" to split the board into horizontal lanes
10. Optionally, select a property in "Card title property" to display that property's value as each card's title instead of the file name

### Example

If your base has a "Status" property with values "To Do", "Doing", and "Done":
- Select "Status" in the "Group by" dropdown
- Three columns will appear: "To Do", "Doing", and "Done" (plus an "Uncategorized" column for notes without a status)
- Drag cards between columns to change their status
- If "Add card to column folder" is configured, click the `+` button to create a new note with that status in that folder
- Click any card to open the note (Cmd/Ctrl+click to open in new tab)
- Drag columns by their handle to reorder them - your order preference will be remembered

If your base also has a "Priority" property with values "High", "Medium", and "Low":
- Select "Status" in the "Group by" dropdown
- Select "Priority" in the "Swimlane by" dropdown
- The board will render one horizontal lane for each priority, and each lane will contain the same status columns
- Drag cards sideways to change their status, or drag them to another lane to change their priority
- Click a `+` button inside a lane to create a new note with both its status and priority filled in
- Drag lane headers to reorder lanes, use the lane toggle to collapse or expand a lane, and drag any column header to reorder that column across all lanes
- Notes without a value for the swimlane property appear in an "Uncategorized" lane
- Leave "Swimlane by" unset to use the original single-axis kanban layout

If your project folders each contain a `README.md` with a `title` property:
- Select `title` in the "Card title property" dropdown
- Cards will display the `title` property value instead of "README"
- If a note is missing the property, the file name is used as a fallback

If your notes have a frontmatter property pointing at a cover image (e.g., `cover: "[[book-cover.jpg]]"` or `cover: "https://example.com/poster.jpg"`):
- Select that property in the "Image property" dropdown
- Each card gets a cover image above the title
- Use "Image fit" to choose between Cover (crop to fill) and Contain (letterbox)
- Drag the "Image aspect ratio" slider to size the cover — wide banner on the left, tall portrait on the right
- The same property value also works in Obsidian's built-in Cards view, so the two views stay in sync

### Column Triggers

Column triggers automatically set or clear frontmatter properties when a card moves to a specific column (or swimlane). This eliminates manual date-stamping and keeps metadata consistent with card position.

#### Configuration

Triggers are configured directly in the `.base` file. Open the `.base` file in a text editor and add `columnTriggers` and/or `swimlaneTriggers` arrays to the view config:

```yaml
columnTriggers:
  - when: "Done"
    set:
      completed_on: "{{today}}"
  - when: "In Progress"
    set:
      started_on: "{{today}}"
  - when: "todo"
    clear:
      - started_on
      - completed_on
```

```yaml
swimlaneTriggers:
  - when: "focus"
    set:
      focus_date: "{{today}}"
```

#### Rule Structure

Each trigger rule has:

| Field | Type | Description |
|-------|------|-------------|
| `when` | string | The column (or swimlane) value that activates the trigger |
| `set` | object | Properties to set on the note's frontmatter (key-value pairs) |
| `clear` | array | Property names to remove from the note's frontmatter |

A single rule can include both `set` and `clear`.

#### Template Variables

Use template variables in `set` values for dynamic content:

| Variable | Resolves to | Example |
|----------|-------------|---------|
| `{{today}}` | Current date in `YYYY-MM-DD` format | `2025-06-11` |
| `{{now}}` | Current datetime in ISO 8601 (no timezone) | `2025-06-11T14:30:00` |

#### Behavior

- **Triggers only fire on transitions** — moving a card to the same column it's already in (e.g., reordering within a column) does not fire any trigger.
- **`set` overwrites** — if the property already has a value, it is replaced with the fresh template value.
- **`clear` deletes** — the listed property keys are removed from frontmatter entirely.
- **Quick-add** — creating a card via the `+` button fires column triggers (the card is transitioning from "not existing" to the column).
- **First match wins** — if multiple rules share the same `when` value, only the first one in the array applies.
- **No trigger on load** — triggers never fire from data updates or re-renders, only from explicit drag-drop and quick-add actions.
- **Empty config** — if `columnTriggers` or `swimlaneTriggers` is not defined or is an empty array, behavior is unchanged from before.

#### Example Workflow

Given this configuration:

```yaml
columnTriggers:
  - when: "Done"
    set:
      completed_on: "{{today}}"
  - when: "In Progress"
    set:
      started_on: "{{today}}"
  - when: "todo"
    clear:
      - started_on
      - completed_on
```

1. Drag a card from "todo" to "In Progress" → `started_on: 2025-06-11` is added to its frontmatter
2. Drag it from "In Progress" to "Done" → `completed_on: 2025-06-11` is added
3. Drag it back to "todo" → both `started_on` and `completed_on` are removed
4. Click `+` in the "In Progress" column → new card gets `started_on: 2025-06-11` immediately

## Development

### Prerequisites

- Node.js (v24)
- npm

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

This will watch for changes and rebuild automatically.

### Testing

```bash
npm test
```

### Type Checking

```bash
npm run typecheck
```

### Linting and Formatting

This project uses [ESLint](https://eslint.org/) for linting and [Biome](https://biomejs.dev/) for formatting. They are intentionally kept separate.

**Lint** (reports rule violations):
```bash
npm run lint
```

**Lint with auto-fix**:
```bash
npm run lint:fix
```

**Format** (rewrites files):
```bash
npm run format
```

**Check formatting** (exits non-zero if unformatted; used by CI and the pre-commit hook):
```bash
npm run format:check
```

### Technical notes

- The plugin uses the **`.obk-`** CSS class prefix (Obsidian Bases Kanban) for all view UI classes to avoid collisions with other plugins and themes.

## Releasing

### Creating a Release

1. **Update version**: Manually update the version in `manifest.json` following [Semantic Versioning](https://semver.org/).

2. **Update package.json**: Ensure the version in `package.json` matches the version in `manifest.json` (the CI workflow will verify this).

3. **Update versions.json**: Add an entry mapping the new version to the correct `minAppVersion` in `versions.json`.

4. **Push to main**: Push your changes to the `main` branch. The GitHub Actions workflow will automatically:
   - Run tests and verify that `manifest.json` and `package.json` versions match
   - Verify that the version exists in `versions.json`
   - Build the plugin (runs `npm run build`)
   - Extract the version from the built `dist/manifest.json`
   - Create a git tag matching the version exactly (no `v` prefix) if it doesn't already exist
   - Create a GitHub release and upload `main.js`, `manifest.json`, and `styles.css` as release assets

   Note: The release workflow only runs on pushes to `main` (not on pull requests). You can also trigger it manually from the GitHub Actions tab.

5. **Submit to Obsidian Community Plugins** (first release only):
   - Follow the [Obsidian plugin submission guidelines](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
   - Submit a PR to the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop functionality
- Inspired by the need for better task management in Obsidian Bases
