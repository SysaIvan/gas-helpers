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
	private _lastLoadedColumns?: (keyof T)[];

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
		const indexes = this._getColumnIndexes(options?.columns);
		const minCol = indexes[0]!;
		const maxCol = indexes[indexes.length - 1]!;
		const selectedSet = new Set(indexes);
		const width = maxCol - minCol + 1;
		const height = to - from + 1;

		const values = this.sheet
			.getRange(from, minCol + 1, height, width)
			.getValues();

		this._lastLoadedColumns = options?.columns;
		this.cache = [];
		for (let i = 0; i < values.length; i++) {
			const rowFull: any[] = [];
			for (const key of Object.keys(colsMap)) {
				const colIndex = colsMap[key as keyof T];
				rowFull[colIndex] = selectedSet.has(colIndex)
					? values[i][colIndex - minCol]
					: undefined;
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
		updater: (entity: E & { _rowIndex: number }) => void
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
	 * Applies all changes (dirty, toDelete) to sheet.
	 * @param refresh - if true, reloads cache from sheet after commit (default false)
	 * @example repo.save(entity); repo.delete(entity); repo.commit();
	 * @example repo.commit({ refresh: true }); // when need fresh cache
	 */
	commit(options?: { refresh?: boolean }) {
		const dirtyList = Array.from(this.dirty)
			.map((entity) => ({
				rowIndex: (entity as any)._rowIndex as number,
				row: entity.toRow().map((v) => v ?? ''),
			}))
			.sort((a, b) => a.rowIndex - b.rowIndex);

		if (dirtyList.length > 0) {
			const fullColCount =
				Math.max(...Object.values(this.entity.config.columns)) + 1;
			const freezColIndices = new Set<number>();
			if (this.entity.config.freezeColumns) {
				for (const key of this.entity.config.freezeColumns) {
					freezColIndices.add(this.entity.config.columns[key]);
				}
			}

			const writeColIndexes = this._lastLoadedColumns
				? this._getColumnIndexes(this._lastLoadedColumns).filter(
						(i) => !freezColIndices.has(i)
					)
				: [...Array(fullColCount).keys()].filter(
						(i) => !freezColIndices.has(i)
					);
			const writeRanges =
				writeColIndexes.length > 0
					? Repository.groupConsecutiveRanges(writeColIndexes)
					: [];

			const blocks: { startRow: number; rows: any[][] }[] = [];
			let current: { startRow: number; rows: any[][] } | null = null;

			for (const { rowIndex, row } of dirtyList) {
				const padded = [
					...row,
					...new Array(fullColCount - row.length).fill(''),
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
				for (const { start, numCols } of writeRanges) {
					const rows = block.rows.map((r) =>
						r.slice(start, start + numCols).map((v) => v ?? '')
					);
					this.sheet
						.getRange(
							block.startRow,
							start + 1,
							block.rows.length,
							numCols
						)
						.setValues(rows);
				}
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

		if (options?.refresh) {
			this.load();
		}
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

	/**
	 * Removes all data rows (except header), clears cache.
	 * @param options.columns - optional list of columns to clear; if omitted, clears all entity columns
	 */
	clear(options?: { columns?: (keyof T)[] }) {
		const lastRow = this.sheet.getLastRow();
		if (lastRow <= 1) return;
		const indexes = this._getColumnIndexes(options?.columns);
		const numRows = lastRow - 1;
		for (const { start, numCols } of Repository.groupConsecutiveRanges(
			indexes
		)) {
			this.sheet.getRange(2, start + 1, numRows, numCols).clearContent();
		}
		this.cache = [];
		this.dirty.clear();
		this.toDelete.clear();
	}

	/** Returns sorted unique column indices for given keys (or all if omitted). */
	private _getColumnIndexes(columns?: (keyof T)[]): number[] {
		const colsMap = this.entity.config.columns;
		const selectedCols = columns ?? (Object.keys(colsMap) as (keyof T)[]);
		return [...new Set(selectedCols.map((c) => colsMap[c]))].sort(
			(a, b) => a - b
		);
	}

	/** Groups non-frozen column indices into consecutive ranges (0-based start, count). */
	private static groupNonFreezRanges(
		colCount: number,
		freezIndices: Set<number>
	): { start: number; numCols: number }[] {
		const indexes: number[] = [];
		for (let i = 0; i < colCount; i++) {
			if (!freezIndices.has(i)) indexes.push(i);
		}
		return Repository.groupConsecutiveRanges(indexes);
	}

	/** Groups sorted column indices into consecutive ranges (0-based start, count). */
	private static groupConsecutiveRanges(
		indexes: number[]
	): { start: number; numCols: number }[] {
		const ranges: { start: number; numCols: number }[] = [];
		for (let i = 0; i < indexes.length; ) {
			let j = i + 1;
			while (j < indexes.length && indexes[j] === indexes[j - 1] + 1) j++;
			ranges.push({ start: indexes[i], numCols: j - i });
			i = j;
		}
		return ranges;
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
