# Triggers

Managing time-based triggers in Google Apps Script by handler function name.

## Methods

| Method                          | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| `has()`                         | Whether a clock trigger exists for the function |
| `delete()`                      | Remove one trigger                              |
| `deleteAll()`                   | Remove all triggers for the function            |
| `set(afterMinutes, removeOld?)` | One-time trigger in N minutes                   |
| `setRecurring(intervalMinutes)` | Recurring trigger every N minutes               |

## Example

```typescript
import { Trigger } from 'gas-helpers/triggers';

function myScheduledTask() {
	// runs on trigger
}

function setupTrigger() {
	const trigger = new Trigger('myScheduledTask');

	// One-time run in 5 minutes
	trigger.set(5);

	// Or recurring every hour (skips if already exists)
	// trigger.setRecurring(60);
}

function removeTrigger() {
	new Trigger('myScheduledTask').deleteAll();
}
```
