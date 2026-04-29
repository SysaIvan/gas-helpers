import { Entity, type EntityConfig } from './Entity';

type SheetsTable = {
	tableId: string;
	name: string;
	range: {
		sheetId: number;
		startRowIndex: number;
		endRowIndex: number;
		startColumnIndex: number;
		endColumnIndex: number;
	};
};

type EntityConstructor<T extends Record<string, any>, E extends Entity<T>> = {
	new (data?: Partial<T>): E;
	fromRow(row: any[]): E;
	config: EntityConfig<T>;
};

/**
 * Options for inserts/deletes/commits that mutate table structure or row count.
 * @property soft - if true (default from repo ctor), clear rows instead of deleting dimensions; insert only into existing empty rows (no `insertDimension`).
 */
type TableWriteOptions = {
	soft?: boolean;
};

/**
 * Repository for a **named Table** in the active spreadsheet (Insert → Table in the Sheets UI).
 * Same ideas as {@link Repository}: cache, dirty tracking, CRUD — but rows are scoped to the table’s range, and inserts/deletes can use the **Sheets API** (`insertDimension` / `deleteDimension`).
 *
 * **Requires the Google Sheets advanced service** (global `Sheets`). In the Apps Script editor: **Services** (or “Advanced Google services”) → add **Google Sheets API**. Without it, construction throws. The Cloud project may also need the Sheets API enabled if you manage APIs there.
 *
 * Subclasses set `sheetName` to the **table name** (not necessarily the worksheet tab name). Metadata is read via `Sheets.Spreadsheets.get`; cell reads/writes use `SpreadsheetApp` on the sheet that contains the table.
 *
 * @template T - Entity data type
 * @template E - Entity class
 */
export abstract class TableRepository<
	T extends Record<string, any>,
	E extends Entity<T>,
> {
	protected abstract sheetName: string;
	protected abstract entity: EntityConstructor<T, E>;
	protected cache: (E & { _rowIndex: number })[] = [];
	protected dirty = new Set<E>();
	protected toDelete = new Set<E>();
	protected spreadsheetId: string;
	protected Sheets: GoogleAppsScript.Sheets;

	private _table?: SheetsTable;
	private _worksheet?: GoogleAppsScript.Spreadsheet.Sheet;
	private _lastLoadedColumns?: (keyof T)[];
	private _nextInsertRow?: number;
	private _soft: boolean;

	/**
	 * @param options - default `soft` for write operations (see {@link TableWriteOptions})
	 * @throws If the Sheets advanced service is not enabled (`Sheets` is undefined)
	 */
	constructor(options?: TableWriteOptions) {
		if (typeof Sheets === 'undefined') {
			throw new Error(
				'Enable the Google Sheets advanced service in the project.'
			);
		}
		this.Sheets = Sheets;
		this.spreadsheetId = SpreadsheetApp.getActive().getId();
		this._soft = options?.soft ?? false;
	}

	/** Resolved table metadata (id, range, sheetId) from the Sheets API. */
	get table(): SheetsTable {
		if (this._table) {
			return this._table;
		}

		const spreadsheet = this.Sheets.Spreadsheets.get(this.spreadsheetId);
		const table = spreadsheet.sheets
			?.flatMap((sheet) =>
				((sheet as any).tables || []).map((table: SheetsTable) => ({
					...table,
					range: {
						...table.range,
						sheetId: sheet.properties!.sheetId!,
					},
				}))
			)
			.find((table) => table.name === this.sheetName);

		if (!table) {
			throw new Error(`Table ${this.sheetName} not found`);
		}

		this._table = table;
		return table;
	}

	/** Worksheet containing this table (`SpreadsheetApp`), matched by `sheetId`. */
	get worksheet(): GoogleAppsScript.Spreadsheet.Sheet {
		if (this._worksheet) {
			return this._worksheet;
		}

		const sheetId = this.table.range.sheetId;
		const sheet = SpreadsheetApp.getActive()
			.getSheets()
			.find((sheet) => sheet.getSheetId() === sheetId);
		if (!sheet) {
			throw new Error(`Sheet for table ${this.sheetName} not found`);
		}

		this._worksheet = sheet;
		return sheet;
	}

	/**
	 * Loads rows inside the table into cache. Header row is skipped; `fromRow` / `toRow` are absolute 1-based sheet indexes, clamped to the table body.
	 * @param options - fromRow, toRow, columns (projection)
	 * @example repo.load(); repo.load({ fromRow: 2, toRow: 100 });
	 */
	load = (options?: {
		fromRow?: number;
		toRow?: number;
		columns?: (keyof T)[];
	}): void => {
		const table = this.table;
		const firstDataRow = table.range.startRowIndex + 2;
		const lastDataRow = table.range.endRowIndex;
		const from = Math.max(options?.fromRow ?? firstDataRow, firstDataRow);
		const to = Math.min(options?.toRow ?? lastDataRow, lastDataRow);

		this._lastLoadedColumns = options?.columns;
		this.cache = [];
		if (to < from) return;

		const indexes = this._getColumnIndexes(options?.columns);
		if (indexes.length === 0) return;

		const minCol = indexes[0]!;
		const maxCol = indexes[indexes.length - 1]!;
		const selectedSet = new Set(indexes);
		const width = maxCol - minCol + 1;
		const height = to - from + 1;
		const values = this.worksheet
			.getRange(
				from,
				table.range.startColumnIndex + minCol + 1,
				height,
				width
			)
			.getValues();

		for (let i = 0; i < values.length; i++) {
			const rowFull: any[] = [];
			for (const key of Object.keys(this.entity.config.columns)) {
				const colIndex = this.entity.config.columns[key as keyof T];
				rowFull[colIndex] = selectedSet.has(colIndex)
					? values[i][colIndex - minCol]
					: undefined;
			}

			const entity = this.entity.fromRow(rowFull) as E;
			(entity as any)._rowIndex = from + i;
			this.cache.push(entity as E & { _rowIndex: number });
		}
	};

	/** All entities from cache. */
	findAll = (): (E & { _rowIndex: number })[] => {
		return this.cache;
	};

	/** Entity by sheet row number or null. */
	findByRowIndex = (rowIndex: number): (E & { _rowIndex: number }) | null => {
		return (
			this.cache.find((entity) => entity._rowIndex === rowIndex) ?? null
		);
	};

	/** Entities with the given field value. */
	findBy = <K extends keyof T>(
		field: K,
		value: T[K]
	): (E & { _rowIndex: number })[] => {
		return this.cache.filter((entity) => (entity as any)[field] === value);
	};

	/** First entity with the given value or null. */
	findOne = <K extends keyof T>(
		field: K,
		value: T[K]
	): (E & { _rowIndex: number }) | null => {
		return (
			this.cache.find((entity) => (entity as any)[field] === value) ??
			null
		);
	};

	/** True if any cached row matches the field value. */
	exists = <K extends keyof T>(field: K, value: T[K]): boolean => {
		return this.cache.some((entity) => (entity as any)[field] === value);
	};

	/** Number of rows in cache. */
	count = (): number => {
		return this.cache.length;
	};

	/** Number of cached rows with the given field value. */
	countBy = <K extends keyof T>(field: K, value: T[K]): number => {
		return this.cache.filter((entity) => (entity as any)[field] === value)
			.length;
	};

	/** Adds entity to the dirty set if `isDirty()`. */
	save = (entity: E & { _rowIndex: number }): void => {
		if (entity.isDirty()) {
			this.dirty.add(entity);
		}
	};

	/** Updates entities via callback and marks them dirty. */
	update = (
		entities: (E & { _rowIndex: number })[],
		updater: (entity: E & { _rowIndex: number }) => void
	): void => {
		entities.forEach((entity) => {
			updater(entity);
			this.save(entity);
		});
	};

	/** Marks entity for deletion on `commit()` (respects `soft` mode). */
	delete = (entity: E & { _rowIndex: number }): void => {
		this.toDelete.add(entity);
		this.dirty.delete(entity);
	};

	/**
	 * Applies dirty updates and deletes. Non-soft deletes use Sheets API `deleteDimension`; non-soft inserts (see `insertBatch`) use `insertDimension`.
	 * @param options.refresh - if true, reloads cache via `load()` after commit
	 * @param options.soft - overrides default soft behavior for delete in this commit
	 * @example repo.save(entity); repo.delete(entity); repo.commit();
	 * @example repo.commit({ refresh: true, soft: true });
	 */
	commit = (options?: { refresh?: boolean; soft?: boolean }): void => {
		this.commitDirty();
		this.commitDeletes(options);

		if (options?.refresh) {
			this.load();
		}
	};

	/** Appends one row (and optional structural row insert when not soft). */
	insert = (entity: E, options?: TableWriteOptions): void => {
		this.insertBatch([entity], options);
	};

	/**
	 * Inserts multiple rows. Optional first arg `fromRow` is the 1-based start row; otherwise uses next slot after cache / `_nextInsertRow`.
	 * @param entities - rows to append
	 * @param fromRowOrOptions - start row **or** `TableWriteOptions` when two args
	 * @param options - merged when first arg is a number
	 */
	insertBatch = (
		entities: E[],
		fromRowOrOptions?: number | TableWriteOptions,
		options?: TableWriteOptions
	): void => {
		if (entities.length === 0) return;

		const fromRow =
			typeof fromRowOrOptions === 'number' ? fromRowOrOptions : undefined;
		const writeOptions =
			typeof fromRowOrOptions === 'object' ? fromRowOrOptions : options;
		const soft = this._isSoft(writeOptions);
		const table = this.table;
		const firstDataRow = table.range.startRowIndex + 2;
		const lastDataRow = table.range.endRowIndex;
		const startRow =
			fromRow ?? this._nextInsertRow ?? firstDataRow + this.cache.length;
		const endRow = startRow + entities.length - 1;
		if (soft && endRow > lastDataRow) {
			throw new Error(
				`Table ${this.sheetName} has no enough empty rows. ` +
					`Need ${entities.length}, available ${Math.max(
						lastDataRow - startRow + 1,
						0
					)}. Add rows to the table manually.`
			);
		}

		if (!soft) {
			this.Sheets.Spreadsheets.batchUpdate(
				{
					requests: [
						{
							insertDimension: {
								range: {
									sheetId: table.range.sheetId,
									dimension: 'ROWS',
									startIndex: startRow - 1,
									endIndex: endRow,
								},
								inheritFromBefore:
									startRow - 1 > table.range.startRowIndex,
							},
						},
					],
				},
				this.spreadsheetId
			);
		}

		const rows = entities.map((entity) =>
			entity.toRow().map((v) => v ?? '')
		);
		const colCount = Math.max(...rows.map((row) => row.length));
		const tableColCount =
			table.range.endColumnIndex - table.range.startColumnIndex;
		if (colCount > tableColCount) {
			throw new Error(
				`Table ${this.sheetName} has ${tableColCount} columns, ` +
					`but entity requires ${colCount}.`
			);
		}
		const normalized = rows.map((row) => {
			const filled = new Array(colCount).fill('');
			row.forEach((value, index) => {
				filled[index] = value ?? '';
			});
			return filled;
		});
		this.worksheet
			.getRange(
				startRow,
				table.range.startColumnIndex + 1,
				entities.length,
				colCount
			)
			.setValues(normalized);

		const rowIndexes = new Set(
			entities.map((_, index) => startRow + index)
		);
		if (soft) {
			this.cache = this.cache.filter(
				(entity) => !rowIndexes.has(entity._rowIndex)
			);
		}
		entities.forEach((entity, index) => {
			(entity as any)._rowIndex = startRow + index;
			(entity as any)._original = this._snapshotColumns(entity);
			this.cache.push(entity as E & { _rowIndex: number });
		});

		this._nextInsertRow = endRow + 1;
		if (!soft) {
			this._table = undefined;
		}
	};

	/** `save()` when `_rowIndex` is set, otherwise `insert()`. */
	upsert = (entity: E & { _rowIndex?: number }): void => {
		if (
			(entity as any)._rowIndex !== null &&
			(entity as any)._rowIndex !== undefined
		) {
			this.save(entity as E & { _rowIndex: number });
		} else {
			this.insert(entity);
		}
	};

	/**
	 * Clears table body rows and resets cache, dirty set, and pending deletes.
	 * If `columns` is omitted and the operation is not `soft`, deletes all data rows via Sheets API `deleteDimension`. Otherwise clears cell contents in the projected column ranges (respects `soft`).
	 * @param options.columns - entity keys limiting which columns are cleared
	 * @param options.soft - overrides the repository default `soft`
	 */
	clear = (options?: { columns?: (keyof T)[]; soft?: boolean }): void => {
		const table = this.table;
		const firstDataRow = table.range.startRowIndex + 2;
		const lastDataRow = table.range.endRowIndex;
		if (lastDataRow < firstDataRow) return;
		const soft = this._isSoft(options);

		if (!options?.columns && !soft) {
			this.Sheets.Spreadsheets.batchUpdate(
				{
					requests: [
						{
							deleteDimension: {
								range: {
									sheetId: table.range.sheetId,
									dimension: 'ROWS',
									startIndex: firstDataRow - 1,
									endIndex: lastDataRow,
								},
							},
						},
					],
				},
				this.spreadsheetId
			);
			this.cache = [];
			this.dirty.clear();
			this.toDelete.clear();
			this._table = undefined;
			this._nextInsertRow = firstDataRow;
			return;
		}

		const indexes = this._getColumnIndexes(options?.columns);
		for (const { start, numCols } of TableRepository.groupConsecutiveRanges(
			indexes
		)) {
			this.worksheet
				.getRange(
					firstDataRow,
					table.range.startColumnIndex + start + 1,
					lastDataRow - firstDataRow + 1,
					numCols
				)
				.clearContent();
		}
		this.cache = [];
		this.dirty.clear();
		this.toDelete.clear();
		this._nextInsertRow = firstDataRow;
	};

	private commitDirty = (): void => {
		const dirtyList = Array.from(this.dirty)
			.filter((entity) => !this.toDelete.has(entity))
			.map((entity) => ({
				rowIndex: (entity as any)._rowIndex as number,
				row: entity.toRow().map((value) => value ?? ''),
			}))
			.sort((a, b) => a.rowIndex - b.rowIndex);

		if (dirtyList.length === 0) {
			this.dirty.clear();
			return;
		}

		const table = this.table;
		const fullColCount =
			Math.max(...Object.values(this.entity.config.columns)) + 1;
		const freezeColIndices = new Set<number>();
		for (const key of this.entity.config.freezeColumns ?? []) {
			freezeColIndices.add(this.entity.config.columns[key]);
		}

		const writeColIndexes = this._lastLoadedColumns
			? this._getColumnIndexes(this._lastLoadedColumns).filter(
					(index) => !freezeColIndices.has(index)
				)
			: [...Array(fullColCount).keys()].filter(
					(index) => !freezeColIndices.has(index)
				);
		const writeRanges =
			writeColIndexes.length > 0
				? TableRepository.groupConsecutiveRanges(writeColIndexes)
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
				const rows = block.rows.map((row) =>
					row
						.slice(start, start + numCols)
						.map((value) => value ?? '')
				);
				this.worksheet
					.getRange(
						block.startRow,
						table.range.startColumnIndex + start + 1,
						block.rows.length,
						numCols
					)
					.setValues(rows);
			}
		}

		this.dirty.clear();
	};

	private commitDeletes = (options?: TableWriteOptions): void => {
		const rowsToDelete = Array.from(this.toDelete)
			.map((entity) => (entity as any)._rowIndex as number)
			.filter(Boolean)
			.sort((a, b) => b - a);

		if (rowsToDelete.length === 0) {
			this.toDelete.clear();
			return;
		}

		const table = this.table;
		const colCount =
			table.range.endColumnIndex - table.range.startColumnIndex;
		const soft = this._isSoft(options);
		for (const rowIndex of rowsToDelete) {
			if (soft) {
				this.worksheet
					.getRange(
						rowIndex,
						table.range.startColumnIndex + 1,
						1,
						colCount
					)
					.clearContent();
			} else {
				this.Sheets.Spreadsheets.batchUpdate(
					{
						requests: [
							{
								deleteDimension: {
									range: {
										sheetId: table.range.sheetId,
										dimension: 'ROWS',
										startIndex: rowIndex - 1,
										endIndex: rowIndex,
									},
								},
							},
						],
					},
					this.spreadsheetId
				);
			}

			this.cache = this.cache
				.filter((entity) => entity._rowIndex !== rowIndex)
				.map((entity) => {
					if (!soft && entity._rowIndex > rowIndex) {
						entity._rowIndex -= 1;
					}
					return entity;
				});
		}

		this.toDelete.clear();
		if (!soft) {
			this._table = undefined;
		}
	};

	private _isSoft = (options?: TableWriteOptions): boolean => {
		return options?.soft ?? this._soft;
	};

	private _getColumnIndexes = (columns?: (keyof T)[]): number[] => {
		const colsMap = this.entity.config.columns;
		const selectedCols = columns ?? (Object.keys(colsMap) as (keyof T)[]);
		return [...new Set(selectedCols.map((column) => colsMap[column]))].sort(
			(a, b) => a - b
		);
	};

	private static groupConsecutiveRanges = (
		indexes: number[]
	): { start: number; numCols: number }[] => {
		const ranges: { start: number; numCols: number }[] = [];
		for (let i = 0; i < indexes.length; ) {
			let j = i + 1;
			while (j < indexes.length && indexes[j] === indexes[j - 1] + 1) j++;
			ranges.push({ start: indexes[i], numCols: j - i });
			i = j;
		}
		return ranges;
	};

	private _snapshotColumns = (entity: E): Partial<T> => {
		const columns = this.entity.config.columns as Record<string, number>;
		const snapshot: Partial<T> = {};
		for (const key in columns) {
			snapshot[key as keyof T] = (entity as any)[key];
		}
		return snapshot;
	};
}
