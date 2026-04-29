# gas-helpers — AI Agent Guide

Helper utilities for Google Apps Script. Use this file when generating code that uses gas-helpers.

## Imports

```typescript
import { ScriptProperty } from 'gas-helpers/properties';
import {
	Entity,
	type EntityConfig,
	Repository,
	TableRepository,
	type Transformer,
} from 'gas-helpers/sheet';
import { TelegramNotifier } from 'gas-helpers/telegram';
import { Trigger } from 'gas-helpers/triggers';
import { Ui } from 'gas-helpers/ui';
```

## GAS Caveats

- **Ui is NOT available** when script runs from: triggers, onEdit, time-driven, API. Always check `Ui.isAvailable()` before `alert`, `confirm`, `prompt`.
- **Secrets**: Store `botToken` in `PropertiesService.getScriptProperties()`, not in code.
- **chatId**: User IDs are numeric; group IDs start with `-100`. Get via `getUpdates` after sending a message to the bot.
- **TableRepository** (`gas-helpers/sheet`): Enable **Google Sheets** under **Advanced Google services** (Editor Services / APIs) so the global `Sheets` object exists. Used for workbook **Tables** (Insert → Table), not arbitrary sheet ranges — `sheetName` is the **table name**.

## Quick Patterns

### UI (only when document is open)

```typescript
if (Ui.isAvailable()) {
	Ui.alert('Done');
	const ok = Ui.confirm('Title', 'Confirm?');
	const input = Ui.prompt('Name', 'Enter:');
}
```

### Triggers

```typescript
const t = new Trigger('myHandler');
t.set(5); // one-time in 5 min
t.setRecurring(60); // every hour
t.deleteAll();
```

### Telegram

```typescript
const n = new TelegramNotifier({ botToken, chatId });
n.sendNotification('Message');
```

### Script properties (typed key-value storage)

```typescript
const state = new ScriptProperty('sync_state', { lastRun: 0, status: 'idle' });
state.set({ lastRun: Date.now(), status: 'ok' });
const current = state.getOrDefault(); // never null when defaults provided
```

### Entity config (0-based columns)

```typescript
static override config: EntityConfig<T> = {
 columns: { id: 0, name: 1 },
 optional: ['email'],
 freezeColumns: ['source'], // not overwritten on commit()
 transformers: { id: { from: v => Number(v), to: v => v } },
};
```

## Module docs

- [ui](./src/ui/README.md) — dialogs
- [triggers](./src/triggers/README.md) — time triggers
- [telegram](./src/telegram/README.md) — bot setup
- [sheet](./src/sheet/README.md) — Entity, Repository, TableRepository (Sheets Tables + advanced service)
- [properties](./src/properties/README.md) — ScriptProperty (typed key-value storage)
