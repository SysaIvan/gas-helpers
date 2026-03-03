# Entity & Repository for Google Sheets

Utilities for working with Google Sheets data in an object-oriented style: Entity — row model, Repository — sheet access with cache and Unit of Work.

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

| Property        | Type                                     | Description                                            |
| --------------- | ---------------------------------------- | ------------------------------------------------------ |
| `columns`       | `Record<keyof T, number>`                | Field to column index mapping (0-based)                |
| `optional`      | `ReadonlyArray<keyof T>`                 | Fields that can be empty (written as `''`)             |
| `primaryKey`    | `string`                                 | Primary key field name (if not set — uses `_rowIndex`) |
| `transformers`  | `{ [K in keyof T]?: Transformer<T[K]> }` | Value transformations on read/write                    |
| `defaults`      | `{ [K in keyof T]?: () => T[K] }`        | Default value factories                                |
| `freezeColumns` | `ReadonlyArray<keyof T>`                 | Columns not overwritten on `commit()` (e.g. formulas)  |

### Transformers

Serialization/deserialization when reading from sheet and writing back:

```typescript
static override config = {
  columns: { id: 0, createdAt: 1, tags: 2 },
  transformers: {
    id: {
      from: (v: unknown) => Number(v),           // string → number
      to: (v: number) => v,
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

// Apply all changes
repo.commit();
```

### Other methods

| Method                  | Description                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `clear(options?)`       | Removes all data rows (except header), clears cache. `options.columns` — optional list of columns to clear |
| `insert(entity)`        | Adds one row                                                                                               |
| `insertBatch(entities)` | Adds multiple rows in one API call                                                                         |

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
- **commit()**: after writing calls `load()` to refresh cache.
- **insert/insertBatch**: write to sheet immediately, update `_rowIndex` and cache.
