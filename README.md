# Kanban Bases View Plugin for Obsidian

A kanban-style drag-and-drop custom view for Obsidian Bases that allows you to organize your notes into columns based on any property.

## Features

- **Dynamic Column Generation**: Select any property from your base to generate kanban columns automatically
- **Drag and Drop**: Move cards between columns with smooth animations
- **Property Selection**: Choose which property determines your columns (e.g., "Status", "Priority", "Category")
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
   git clone https://github.com/yourusername/obsidian-bases-kanban-custom-view.git
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
3. Select the property you want to use for columns (e.g., "Status")
4. Your notes will be automatically organized into columns based on the selected property's values
5. Drag cards between columns to update the property value

### Example

If your base has a "Status" property with values "To Do", "Doing", and "Done":
- Select "Status" as your column property
- Three columns will appear: "To Do", "Doing", and "Done"
- Drag cards between columns to change their status

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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop functionality
- Inspired by the need for better task management in Obsidian Bases

