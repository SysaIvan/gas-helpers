# Properties

Типобезопасная обёртка для `PropertiesService.getScriptProperties()`. Хранит значения как JSON. Предназначена для состояния скрипта, не для конфигурации.

## Методы

| Метод                | Описание                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| `get()`              | Читает значение, возвращает `T \| null`                                         |
| `set(value)`         | Записывает значение (JSON.stringify)                                            |
| `delete()`           | Удаляет свойство                                                                |
| `exists()`           | Проверяет наличие значения                                                      |
| `getOrDefault(def?)` | Возвращает значение или fallback; без `def` использует defaults из конструктора |

## Пример

```typescript
import { ScriptProperty } from 'gas-helpers/properties';

type SyncState = { lastRun: number; status: string };

// без дефолтов
export const syncState = new ScriptProperty<SyncState>('sync_state');
syncState.set({ lastRun: Date.now(), status: 'ok' });
const state = syncState.get(); // SyncState | null
syncState.delete();

// с дефолтами
export const syncState = new ScriptProperty('sync_state', {
	lastRun: 0,
	status: 'idle',
});
syncState.get(); // SyncState | null (возвращает defaults если нет значения)
syncState.getOrDefault(); // SyncState (никогда не null)
```
