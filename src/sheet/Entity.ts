/**
 * Value transformation when reading from sheet (from) and writing (to).
 * @template T - Value type
 * @template E - Entity type (for `to` second arg)
 */
export type Transformer<
	T,
	E extends Record<string, any> = Record<string, any>,
> = {
	/** When reading row from sheet. Second arg: full row array. */
	from?: (value: unknown, row: unknown[]) => T;
	/** When writing to sheet. Second arg: full entity object. */
	to?: (value: T, entity: E) => unknown;
};

/** Entity configuration: columns, transformers, optional, defaults, primaryKey */
export type EntityConfig<T extends Record<string, any>> = {
	columns: Record<keyof T, number>;
	transformers?: { [K in keyof T]?: Transformer<T[K], T> };
	optional?: ReadonlyArray<keyof T>;
	defaults?: { [K in keyof T]?: () => T[K] };
	primaryKey?: string;
	/** Columns not overwritten on commit() (e.g. formulas) */
	freezeColumns?: ReadonlyArray<keyof T>;
};

/**
 * Base class for a Google Sheets table row.
 * Maps array row[] to object and back via config.
 * @template T - Entity data type
 */
export abstract class Entity<T extends Record<string, any>> {
	protected static config: EntityConfig<any>;

	private _original?: Partial<T>;

	constructor(data?: Partial<T>) {
		const cfg = (this.constructor as typeof Entity).config;

		if (cfg?.defaults) {
			for (const key in cfg.defaults) {
				(this as any)[key] = cfg.defaults[key]!();
			}
		}

		if (data) Object.assign(this, data);
	}

	/**
	 * Creates entity from sheet row (array of values).
	 * @param row - Array of cell values (0-based indices from config.columns)
	 * @returns Entity of type T
	 * @example const user = UserEntity.fromRow([1, 'Alice', 'a@x.com']);
	 */
	static fromRow<T>(this: new (data: T) => any, row: any[]): T {
		const instance: any = new this({} as T);
		const ctor = this as unknown as typeof Entity;
		const cfg = ctor.config;
		const columns = cfg.columns;
		const transformers = cfg.transformers ?? {};

		for (const key in columns) {
			const colIndex = columns[key];
			let value = row[colIndex];

			if (transformers[key]?.from) {
				value = transformers[key].from!(value, row);
			}

			instance[key] = value;
		}

		const original: Partial<T> = {};
		for (const key in columns) {
			original[key as keyof T] = instance[key];
		}
		instance._original = original;

		return instance;
	}

	/**
	 * Converts entity to row for writing to sheet.
	 * validate() is called before conversion.
	 * @returns Array of values for cells
	 */
	toRow(): any[] {
		this.validate();

		const ctor = this.constructor as typeof Entity;
		const cfg = ctor.config;
		const columns = cfg.columns;
		const transformers = cfg.transformers ?? {};
		const optional = new Set(cfg.optional ?? []);

		const row: any[] = [];

		for (const key in columns) {
			let value = (this as any)[key];

			if (value === undefined && optional.has(key)) {
				row[columns[key]] = '';
				continue;
			}

			if (transformers[key]?.to) {
				value = transformers[key].to!(value, this as T);
			}

			row[columns[key]] = value;
		}

		return row;
	}

	/** Validates entity before toRow(). Throws Error on invalid data. */
	abstract validate(): void;

	/**
	 * Checks if data changed after fromRow or insert.
	 * @returns true if data was modified
	 */
	isDirty(): boolean {
		if (!this._original) return true;

		const ctor = this.constructor as typeof Entity;
		const columns = ctor.config.columns;

		for (const key in columns) {
			const current = (this as any)[key];
			const original = (this._original as any)[key];

			if (current instanceof Date && original instanceof Date) {
				if (current.getTime() !== original.getTime()) return true;
			} else if (Array.isArray(current) && Array.isArray(original)) {
				if (JSON.stringify(current) !== JSON.stringify(original))
					return true;
			} else if (current !== original) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns primary key (primaryKey or _rowIndex).
	 * @throws Error if primaryKey not set and _rowIndex is missing
	 */
	getPrimaryKey(): any {
		const ctor = this.constructor as typeof Entity;
		if (ctor.config.primaryKey)
			return (this as any)[ctor.config.primaryKey];

		const rowIndex = (this as any)._rowIndex;
		if (rowIndex === null || rowIndex === undefined)
			throw new Error('Primary key not defined and rowIndex not set');
		return rowIndex;
	}
}
