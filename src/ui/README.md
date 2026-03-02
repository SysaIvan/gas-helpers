# Ui

Utilities for Spreadsheet UI dialogs (alert, confirm, prompt). All methods check UI availability — when running from a trigger or without an open document they return without error.

## Methods

| Method                    | Description                        |
| ------------------------- | ---------------------------------- |
| `isAvailable()`           | Checks if UI is available          |
| `alert(message)`          | Alert dialog                       |
| `confirm(title, message)` | Confirm OK/Cancel, returns boolean |
| `prompt(title, message)`  | Text input, returns string \| null |

## Example

```typescript
import { Ui } from 'gas-helpers/ui';

// Check before showing dialog
if (Ui.isAvailable()) {
	Ui.alert('Done!');
	const ok = Ui.confirm('Delete?', 'Are you sure?');
	const name = Ui.prompt('Name', 'Enter user name:');
}
```
