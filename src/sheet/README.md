# Entity & Repository for Google Sheets

Utilities for working with Google Sheets data in an object-oriented style: **Entity** — row model; **Repository** — whole sheet tab (cache + Unit of Work); **TableRepository** — a named **Table** (Insert → Table) with optional Sheets REST API for resizing rows.

---

## Entity

`Entity<T>` — abstract base class for a table row. Maps array `row[]` to object and back.

### Minimal example

```typescript
import { Entity, type EntityConfig } from './Entity';

type UserData = { id: number; name: string; email?: string };

class UserEntity extends Entity<UserData> {
	declare id: number;
	declare name: string;
	declare email?: string;

	static override config: EntityConfig<UserData> = {
		columns: { id: 0, name: 1, email: 2 },
		optional: ['email'],
	};

	validate(): void {
		if (!this.name) throw new Error('name is required');
	}
}
```

### Configuration (EntityConfig)

Single `config` object with fields:

| Property        | Type                                        | Description                                            |
| --------------- | ------------------------------------------- | ------------------------------------------------------ |
| `columns`       | `Record<keyof T, number>`                   | Field to column index mapping (0-based)                |
| `optional`      | `ReadonlyArray<keyof T>`                    | Fields that can be empty (written as `''`)             |
| `primaryKey`    | `string`                                    | Primary key field name (if not set — uses `_rowIndex`) |
| `transformers`  | `{ [K in keyof T]?: Transformer<T[K], T> }` | Value transformations on read/write                    |
| `defaults`      | `{ [K in keyof T]?: () => T[K] }`           | Default value factories                                |
| `freezeColumns` | `ReadonlyArray<keyof T>`                    | Columns not overwritten on `commit()` (e.g. formulas)  |

### Transformers

Serialization/deserialization when reading from sheet and writing back. `from(value, row)` receives the full row array; `to(value, entity)` receives the full entity object.

```typescript
static override config = {
  columns: { id: 0, createdAt: 1, tags: 2 },
  transformers: {
    id: {
      from: (v: unknown, row) => Number(v),           // string → number; row = full row
      to: (v: number, entity) => v,
    },
    createdAt: {
      from: (v: unknown) => v ? new Date(v as string) : undefined,
      to: (d: Date) => d?.toISOString() ?? '',
    },
    tags: {
      from: (v: unknown) => (typeof v === 'string' ? v.split(',') : []),
      to: (arr: string[]) => arr.join(','),
    },
  },
};
```

### Methods

#### `static fromRow(row: any[]): T`

Creates entity from row (array of values):

```typescript
const user = UserEntity.fromRow([1, 'Alice', 'alice@example.com']);
// user.id === 1, user.name === 'Alice', user.email === 'alice@example.com'
```

#### `toRow(): any[]`

Converts entity to row. validate() is called before conversion:

```typescript
const user = new UserEntity({ id: 1, name: 'Bob' });
const row = user.toRow(); // [1, 'Bob', '']
```

#### `isDirty(): boolean`

Checks if data changed after `fromRow` (or after insert). Supports Date and arrays:

```typescript
const user = UserEntity.fromRow([1, 'Alice']);
user.isDirty(); // false
user.name = 'Bob';
user.isDirty(); // true
```

#### `getPrimaryKey(): any`

Returns primary key: value of `primaryKey` or `_rowIndex`:

```typescript
user.getPrimaryKey(); // 1 (if primaryKey = 'id') or row number
```

---

## Repository

`Repository<T, E>` — abstract class for working with a sheet via cache and Unit of Work pattern.

### Creating a repository

```typescript
class UserRepository extends Repository<UserData, UserEntity> {
	protected entity = UserEntity;
	protected sheetName = 'Users';
}
```

Expected: first row is headers, data from row 2.

### Loading

```typescript
const repo = new UserRepository();

// Full table
repo.load();

// Row range
repo.load({ fromRow: 2, toRow: 100 });

// Selected columns only (projection)
repo.load({ columns: ['id', 'name'] });
// commit() writes only loaded columns — unloaded columns are preserved
```

### Reading

| Method                  | Returns                                  |
| ----------------------- | ---------------------------------------- |
| `findAll()`             | All entities from cache                  |
| `findByRowIndex(n)`     | Entity by row number or `null`           |
| `findBy(field, value)`  | Array of matching entities               |
| `findOne(field, value)` | First matching entity or `null`          |
| `exists(field, value)`  | `boolean`                                |
| `count()`               | Number of records in cache               |
| `countBy(field, value)` | Number of records with given field value |

```typescript
repo.load();
const all = repo.findAll();
const alice = repo.findOne('name', 'Alice');
const active = repo.findBy('status', 'active');
const n = repo.countBy('role', 'admin');
```

### Modifications (Unit of Work)

All changes are accumulated first, then applied via `commit()`.

```typescript
// Update
const user = repo.findByRowIndex(2)!;
user.name = 'Alice Updated';
repo.save(user); // added to dirty only if isDirty()

// Delete
repo.delete(user);

// Insert (writes to sheet immediately)
const newUser = new UserEntity({ id: 99, name: 'New' });
repo.insert(newUser);

// Batch insert
repo.insertBatch([
	new UserEntity({ id: 1, name: 'A' }),
	new UserEntity({ id: 2, name: 'B' }),
]);

// Upsert: save if _rowIndex exists, else insert
repo.upsert(user);

// Apply all changes (no cache reload by default)
repo.commit();
repo.commit({ refresh: true }); // reload cache when needed
```

### Other methods

| Method                            | Description                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `commit(options?)`                | Applies dirty/toDelete to sheet. `options.refresh: true` — reload cache (default false)                    |
| `clear(options?)`                 | Removes all data rows (except header), clears cache. `options.columns` — optional list of columns to clear |
| `insert(entity)`                  | Adds one row                                                                                               |
| `insertBatch(entities, fromRow?)` | Adds multiple rows in one API call. `fromRow` — optional start row (default: after last row)               |

---

## TableRepository

`TableRepository<T, E>` — abstract class like `Repository`, but bound to a **named Table** in the workbook (Sheets menu **Insert → Table**). It resolves the range via **`Sheets.Spreadsheets.get`** (advanced service), then reads/writes cells with `SpreadsheetApp` on the sheet that owns the table.

### Google Sheets advanced service (required)

In the Apps Script editor, open **Services** (_Advanced Google services_ / редактор сервисов) and enable **Google Sheets API** so the global `Sheets` object exists. If the service is off, constructing `TableRepository` throws. Depending on deployment, ensure the Sheets API is also enabled on the GCP project tied to the script.

**`sheetName`** on the subclass must be the **table name** shown in Sheets (often different from the worksheet tab title).

### Constructor

```typescript
new TableRepositorySubclass(); // defaults
new TableRepositorySubclass({ soft: true }); // default soft writes (see below)
```

### Repository vs TableRepository

|                            | Repository                   | TableRepository                                                                             |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Scope                      | Entire sheet tab by tab name | One **Table** entity by **table name**                                                      |
| Header / data rows         | Row 1 header, row 2+ data    | First row inside the table range = header; data rows follow                                 |
| `load({ fromRow, toRow })` | 1-based sheet rows           | Same (absolute sheet indexes); results are clipped to the table body                        |
| Structural row inserts     | Appends rows (last row + 1)  | Can call REST `batchUpdate` (`insertDimension`) when **not** `soft`                         |
| Full clear (`clear`)       | Clears columns from row 2    | Without `columns` and not **soft**, can remove all data rows with `deleteDimension` via API |

### **soft** mode (`TableWriteOptions`)

If `soft` is `true` (constructor default or per-call options): **delete** clears row cells instead of removing the row dimension; **insert** only writes into existing empty rows inside the table (no `insertDimension`). Use when the table size is fixed or you want to avoid structural changes.

### Creating a repository

```typescript
class OrderTableRepository extends TableRepository<OrderData, OrderEntity> {
	protected entity = OrderEntity;
	protected sheetName = 'SalesTable'; // must match the Table name in the UI
}
```

### Loading, reading, Unit of Work

Same surface as `Repository` where applicable: `load`, `findAll`, `findByRowIndex`, `findBy`, `findOne`, `exists`, `count`, `countBy`, `save`, `update`, `delete`, `upsert`.

`commit` supports:

```typescript
repo.commit();
repo.commit({ refresh: true });
repo.commit({ soft: true }); // propagate to deletes in this commit
```

Insert:

```typescript
repo.insert(entity);
repo.insert(entity, { soft: true });

repo.insertBatch([e1, e2]);
repo.insertBatch([e1, e2], startRow); // optional 1-based start row
repo.insertBatch([e1, e2], { soft: true });
repo.insertBatch([e1, e2], startRow, { soft: true });
```

### Other TableRepository specifics

| Method             | Notes                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit(options?)` | Dirty rows + deletes; `refresh` reloads cache. `soft` overrides default for **deletes** in this batch.                                            |
| `clear(options?)`  | `columns` narrows clearing. Full wipe without `columns` and **not** `soft` deletes data rows via `deleteDimension`; otherwise clears cell ranges. |

`freezeColumns` on the entity behaves like `Repository`: non-frozen columns are written on `commit()`; frozen columns stay formulas/values untouched.

---

## Full example

```typescript
// 1. Entity
type TaskData = { id: number; title: string; done: boolean };

class TaskEntity extends Entity<TaskData> {
	declare id: number;
	declare title: string;
	declare done: boolean;

	static override config = {
		columns: { id: 0, title: 1, done: 2 },
		transformers: {
			done: {
				from: (v: unknown) => v === true || v === 'TRUE' || v === 1,
				to: (v: boolean) => v,
			},
		},
	};

	validate(): void {
		if (!this.title?.trim()) throw new Error('title required');
	}
}

// 2. Repository
class TaskRepository extends Repository<TaskData, TaskEntity> {
	protected entity = TaskEntity;
	protected sheetName = 'Tasks';
}

// 3. Usage
const taskRepo = new TaskRepository();
taskRepo.load();

const todo = taskRepo.findBy('done', false);
todo.forEach((t) => {
	t.done = true;
	taskRepo.save(t);
});

taskRepo.insert(new TaskEntity({ id: 10, title: 'New task', done: false }));
taskRepo.commit();
```

---

### freezeColumns

Columns not overwritten on `commit()` (e.g. formulas like `=IMPORTRANGE(...)`). Only non-frozen columns are written:

```typescript
static override config = {
  columns: { id: 0, source: 1, name: 2 },
  freezeColumns: ['source'],
};
```

Without `freezeColumns`, `getValues()` returns the calculated value, and `setValues()` on commit overwrites the formula with that value.

---

## Notes

- **Columns**: 0-based indices (same as array `row`).
- **Header**: first row is headers, `load()` reads from row 2.
- **save()**: adds to dirty only if `entity.isDirty()`.
- **commit(options?)**: writes dirty/toDelete to sheet. `options.refresh: true` — reload cache after (default false).
- **insert/insertBatch**: write to sheet immediately, update `_rowIndex` and cache.
- **TableRepository**: uses the Sheets advanced service (`Sheets`). Enable it in the script project before use. Targets a **named Table**; `sheetName` is the table name from the Sheets UI.
