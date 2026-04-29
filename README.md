# gas-helpers

![](https://img.shields.io/badge/Coverage-92%25-83A603.svg?style=flat&prefix=$coverage$)

Helper utilities for Google Apps Script: UI, triggers, Telegram notifications, Google Sheets (`Entity`, `Repository`, `TableRepository` for named tables via the Sheets API).

> **For AI agents**: See [AGENTS.md](./AGENTS.md) for imports, patterns, and GAS caveats.

## Installation

```bash
npm install gas-helpers
```

## Modules

| Module                                   | Description                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ui](./src/ui/README.md)                 | Spreadsheet UI dialogs (alert, confirm, prompt) with availability check                    |
| [triggers](./src/triggers/README.md)     | Managing time-based triggers in Google Apps Script                                         |
| [telegram](./src/telegram/README.md)     | Sending notifications to Telegram via Bot API                                              |
| [sheet](./src/sheet/README.md)           | Entity, Repository (whole tab), TableRepository (Insert → Table + Sheets advanced service) |
| [properties](./src/properties/README.md) | ScriptProperty for typed key-value storage in script properties                            |

## Requirements

- Google Apps Script
- `@types/google-apps-script` (peer dependency)

## Common Pitfalls

- **Ui unavailable**: When script runs from a trigger, `onEdit`, or time-driven execution, `SpreadsheetApp.getUi()` throws. Always use `Ui.isAvailable()` before `alert`, `confirm`, `prompt`.
- **Secrets**: Store `botToken` in `PropertiesService.getScriptProperties()`, not in source code.
- **Entity columns**: Column indices are 0-based (same as array indices).
- **TableRepository**: Requires the **Google Sheets advanced service** enabled in the Apps Script project (Editor → Services / **+** Google Sheets API). Uses the REST Sheets API (`Sheets.Spreadsheets`) for table metadata and some row operations; bind `sheetName` to the **table name** from the Sheets UI, not necessarily the worksheet tab title.

## License

ISC
