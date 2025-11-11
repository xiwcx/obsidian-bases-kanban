# Kanban Bases View Plugin for Obsidian

A kanban-style drag-and-drop custom view for Obsidian Bases that allows you to organize your notes into columns based on any property.

## Demo

<video src="https://github.com/user-attachments/assets/933e075a-041d-40ea-b65a-13944173c95f" controls width="100%" title="Kanban Bases View Demo - Drag and drop tasks between columns"></video>

## Features

- **Dynamic Column Generation**: Select any property from your base to generate kanban columns automatically
- **Drag and Drop**: Move cards between columns with smooth animations
- **Column Reordering**: Drag columns by their handle (⋮⋮) to reorder them to your preference
- **Column Order Persistence**: Your column order is saved per property and persists across sessions
- **Property Selection**: Choose which property determines your columns (e.g., "Status", "Priority", "Category")
- **Uncategorized Entries**: Notes without a value for the selected property are automatically grouped in an "Uncategorized" column
- **Click to Open**: Click any card to open the corresponding note
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
6. Click any card to open the corresponding note
7. Drag columns by their handle (⋮⋮) to reorder them - your preferred order will be saved

### Example

If your base has a "Status" property with values "To Do", "Doing", and "Done":
- Select "Status" in the "Group by" dropdown
- Three columns will appear: "To Do", "Doing", and "Done" (plus an "Uncategorized" column for notes without a status)
- Drag cards between columns to change their status
- Click any card to open the note
- Drag columns by their handle to reorder them - your order preference will be remembered

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

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

## Releasing

### Version Bumping

To bump the version manually (for local development):

```bash
npm run version
```

This will increment the minor version in `manifest.json`, `package.json`, and update `versions.json`.

### Creating a Release

1. **Update version**: Manually update the version in `manifest.json` following [Semantic Versioning](https://semver.org/), or use `npm run version` for minor version bumps.

2. **Update versions.json**: Ensure the new version maps to the correct `minAppVersion` in `versions.json`.

3. **Build**: Run `npm run build` to create production artifacts in the `dist/` directory.

4. **Create GitHub Release**:
   - Push your changes to the repository
   - Create a git tag matching the version exactly (no `v` prefix): `git tag 0.36.0`
   - Push the tag: `git push origin 0.36.0`
   - The GitHub Actions workflow will automatically create a release and upload `main.js`, `manifest.json`, and `styles.css` as release assets

   Alternatively, you can trigger the release workflow manually from the GitHub Actions tab.

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

