import { Entity, type EntityConfig } from './Entity';

/**
 * Repository for working with a Google Sheets tab.
 * Cache, Unit of Work, CRUD. First row is headers, data from row 2.
 * @template T - Entity data type
 * @template E - Entity class
 */
export abstract class Repository<
	T extends Record<string, any>,
	E extends Entity<T>,
> {
	protected cache: (E & { _rowIndex: number })[] = [];
	protected dirty = new Set<E>();
	protected toDelete = new Set<E>();

	protected abstract entity: {
		new (data?: Partial<T>): E;
		fromRow(row: any[]): E;
		config: EntityConfig<T>;
	};
	protected abstract sheetName: string;

	private _sheet?: GoogleAppsScript.Spreadsheet.Sheet;

	public get sheet(): GoogleAppsScript.Spreadsheet.Sheet {
		if (!this._sheet) {
			const ss = SpreadsheetApp.getActive();
			this._sheet = ss.getSheetByName(this.sheetName)!;
			if (!this._sheet)
				throw new Error(`Sheet ${this.sheetName} not found`);
		}
		return this._sheet;
	}

	/**
	 * Loads data from sheet into cache. First row = headers, data from row 2.
	 * @param options - fromRow, toRow, columns (projection)
	 * @example repo.load(); repo.load({ fromRow: 2, toRow: 100 });
	 */
	load(options?: {
		fromRow?: number;
		toRow?: number;
		columns?: (keyof T)[];
	}) {
		const from = options?.fromRow ?? 2;
		const to = options?.toRow ?? this.sheet.getLastRow();
		if (to < from) return;

		const colsMap = this.entity.config.columns;
		const selectedCols =
			options?.columns ?? (Object.keys(colsMap) as (keyof T)[]);
		const selectedIndexes = selectedCols.map((c) => colsMap[c]);
		const minCol = Math.min(...selectedIndexes);
		const maxCol = Math.max(...selectedIndexes);
		const width = maxCol - minCol + 1;
		const height = to - from + 1;

		const values = this.sheet
			.getRange(from, minCol + 1, height, width)
			.getValues();

		this.cache = [];
		for (let i = 0; i < values.length; i++) {
			const rowFull: any[] = [];
			for (const key of Object.keys(colsMap)) {
				const colIndex = colsMap[key as keyof T];
				const idx = selectedIndexes.indexOf(colIndex);
				rowFull[colIndex] = idx >= 0 ? values[i][idx] : undefined;
			}

			const entity = this.entity.fromRow(rowFull) as E;
			(entity as any)._rowIndex = from + i;
			this.cache.push(entity as E & { _rowIndex: number });
		}
	}

	/** All entities from cache. */
	findAll(): (E & { _rowIndex: number })[] {
		return this.cache;
	}

	/** Entity by row number or null. */
	findByRowIndex(rowIndex: number): (E & { _rowIndex: number }) | null {
		return this.cache.find((e) => e._rowIndex === rowIndex) ?? null;
	}

	/** Array of entities with given field value. */
	findBy<K extends keyof T>(
		field: K,
		value: T[K]
	): (E & { _rowIndex: number })[] {
		return this.cache.filter((e) => (e as any)[field] === value);
	}

	/** First entity with given value or null. */
	findOne<K extends keyof T>(
		field: K,
		value: T[K]
	): (E & { _rowIndex: number }) | null {
		return this.cache.find((e) => (e as any)[field] === value) ?? null;
	}

	/** Checks if at least one record with given value exists. */
	exists<K extends keyof T>(field: K, value: T[K]): boolean {
		return this.cache.some((e) => (e as any)[field] === value);
	}

	/** Number of records in cache. */
	count(): number {
		return this.cache.length;
	}

	/** Number of records with given field value. */
	countBy<K extends keyof T>(field: K, value: T[K]): number {
		return this.cache.filter((e) => (e as any)[field] === value).length;
	}

	/** Adds entity to dirty set if isDirty(). */
	save(entity: E & { _rowIndex: number }) {
		if (entity.isDirty()) {
			this.dirty.add(entity);
		}
	}

	/** Updates entities via callback and adds to dirty. */
	update(
		entities: (E & { _rowIndex: number })[],
		updater: (entity: E) => void
	): void {
		entities.forEach((entity) => {
			updater(entity);
			this.save(entity);
		});
	}

	/** Marks entity for deletion on commit(). */
	delete(entity: E & { _rowIndex: number }) {
		this.toDelete.add(entity);
	}

	/**
	 * Applies all changes (dirty, toDelete) to sheet and reloads cache.
	 * @example repo.save(entity); repo.delete(entity); repo.commit();
	 */
	commit() {
		const dirtyList = Array.from(this.dirty)
			.map((entity) => ({
				rowIndex: (entity as any)._rowIndex as number,
				row: entity.toRow().map((v) => v ?? ''),
			}))
			.sort((a, b) => a.rowIndex - b.rowIndex);

		if (dirtyList.length > 0) {
			const colCount = Math.max(...dirtyList.map((d) => d.row.length));

			const blocks: { startRow: number; rows: any[][] }[] = [];
			let current: { startRow: number; rows: any[][] } | null = null;

			for (const { rowIndex, row } of dirtyList) {
				const padded = [
					...row,
					...new Array(colCount - row.length).fill(''),
				];
				if (
					current &&
					rowIndex === current.startRow + current.rows.length
				) {
					current.rows.push(padded);
				} else {
					current = { startRow: rowIndex, rows: [padded] };
					blocks.push(current);
				}
			}

			for (const block of blocks) {
				this.sheet
					.getRange(block.startRow, 1, block.rows.length, colCount)
					.setValues(block.rows);
			}
		}
		this.dirty.clear();

		const rowsToDelete = Array.from(this.toDelete)
			.map((e) => (e as any)._rowIndex as number)
			.filter(Boolean)
			.sort((a, b) => b - a);

		for (const rowIndex of rowsToDelete) {
			this.sheet
				.getRange(
					rowIndex,
					1,
					1,
					Math.max(...Object.values(this.entity.config.columns)) + 1
				)
				.clearContent();
		}
		this.toDelete.clear();

		this.load();
	}

	/** Inserts one row, updates _rowIndex and cache. */
	insert(entity: E) {
		const row = entity.toRow().map((v) => v ?? '');
		const startRow = this.sheet.getLastRow() + 1;
		this.sheet.getRange(startRow, 1, 1, row.length).setValues([row]);
		(entity as any)._rowIndex = startRow;
		(entity as any)._original = this._snapshotColumns(entity);
		this.cache.push(entity as E & { _rowIndex: number });
	}

	/** Inserts multiple rows in a single API call. */
	insertBatch(entities: E[]) {
		if (entities.length === 0) return;

		const startRow = this.sheet.getLastRow() + 1;
		const rows = entities.map((e) => e.toRow());
		const colCount = Math.max(...rows.map((r) => r.length));

		const normalized = rows.map((r) => {
			const filled = new Array(colCount).fill('');
			r.forEach((v, i) => {
				filled[i] = v ?? '';
			});
			return filled;
		});

		this.sheet
			.getRange(startRow, 1, entities.length, colCount)
			.setValues(normalized);

		entities.forEach((entity, i) => {
			(entity as any)._rowIndex = startRow + i;
			(entity as any)._original = this._snapshotColumns(entity);
			this.cache.push(entity as E & { _rowIndex: number });
		});
	}

	/** save() if _rowIndex exists, otherwise insert(). */
	upsert(entity: E & { _rowIndex?: number }) {
		if (
			(entity as any)._rowIndex !== null &&
			(entity as any)._rowIndex !== undefined
		) {
			this.save(entity as E & { _rowIndex: number });
		} else {
			this.insert(entity);
		}
	}

	/** Removes all data rows (except header), clears cache. */
	clear() {
		const lastRow = this.sheet.getLastRow();
		if (lastRow <= 1) return;
		this.sheet
			.getRange(
				2,
				1,
				lastRow - 1,
				Math.max(...Object.values(this.entity.config.columns)) + 1
			)
			.clearContent();
		this.cache = [];
		this.dirty.clear();
		this.toDelete.clear();
	}

	private _snapshotColumns(entity: E): Partial<T> {
		const columns = this.entity.config.columns as Record<string, number>;
		const snapshot: Partial<T> = {};
		for (const key in columns) {
			snapshot[key as keyof T] = (entity as any)[key];
		}
		return snapshot;
	}
}
