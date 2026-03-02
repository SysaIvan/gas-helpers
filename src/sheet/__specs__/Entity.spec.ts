import { Entity } from '../Entity';

type TestData = { id: number; name: string; active?: boolean };

class TestEntity extends Entity<TestData> {
	declare id: number;
	declare name: string;
	declare active?: boolean;

	static override config = {
		columns: {
			id: 0,
			name: 1,
			active: 2,
		},
		optional: ['active'] as const,
		transformers: {
			id: {
				from: (v: unknown) => Number(v),
				to: (v: number) => v,
			},
		},
	};

	validate(): void {
		if (this.name === undefined || this.name === null)
			throw new Error('name is required');
	}
}

describe('Entity', () => {
	describe('constructor', () => {
		it('assigns data to instance', () => {
			const e = new TestEntity({ id: 1, name: 'foo' });
			expect(e.id).toBe(1);
			expect(e.name).toBe('foo');
		});
	});

	describe('fromRow', () => {
		it('parses row into entity', () => {
			const e = TestEntity.fromRow([10, 'Alice', true]) as TestEntity;
			expect(e.id).toBe(10);
			expect(e.name).toBe('Alice');
			expect(e.active).toBe(true);
		});

		it('applies transformer from', () => {
			const e = TestEntity.fromRow(['5', 'Bob', false]) as TestEntity;
			expect(e.id).toBe(5);
			expect(typeof e.id).toBe('number');
		});

		it('sets _original for dirty check', () => {
			const e = TestEntity.fromRow([1, 'x', true]) as TestEntity;
			expect(e.isDirty()).toBe(false);
		});
	});

	describe('toRow', () => {
		it('serializes entity to row', () => {
			const e = new TestEntity({ id: 1, name: 'test' });
			const row = e.toRow();
			expect(row[0]).toBe(1);
			expect(row[1]).toBe('test');
			expect(row[2]).toBe('');
		});

		it('validates before serializing', () => {
			const e = new TestEntity({ id: 1 });
			expect(() => e.toRow()).toThrow('name is required');
		});
	});

	describe('isDirty', () => {
		it('returns true when _original is not set', () => {
			const e = new TestEntity({ id: 1, name: 'x' });
			expect(e.isDirty()).toBe(true);
		});

		it('returns false when nothing changed', () => {
			const e = TestEntity.fromRow([1, 'x']) as TestEntity;
			expect(e.isDirty()).toBe(false);
		});

		it('returns true when field changed', () => {
			const e = TestEntity.fromRow([1, 'x']) as TestEntity;
			e.name = 'y';
			expect(e.isDirty()).toBe(true);
		});

		it('compares Date by getTime', () => {
			class DateEntity extends Entity<{ d: Date }> {
				declare d: Date;
				static override config = { columns: { d: 0 } };
				validate(): void {}
			}
			const d = new Date(1000);
			const row = [d];
			const e = DateEntity.fromRow(row) as DateEntity;
			expect(e.isDirty()).toBe(false);
			e.d = new Date(1000);
			expect(e.isDirty()).toBe(false);
			e.d = new Date(2000);
			expect(e.isDirty()).toBe(true);
		});

		it('compares arrays by JSON', () => {
			class ArrayEntity extends Entity<{ arr: number[] }> {
				declare arr: number[];
				static override config = { columns: { arr: 0 } };
				validate(): void {}
			}
			const row = [[1, 2]];
			const e = ArrayEntity.fromRow(row) as ArrayEntity;
			expect(e.isDirty()).toBe(false);
			e.arr = [1, 2, 3];
			expect(e.isDirty()).toBe(true);
		});
	});

	describe('getPrimaryKey', () => {
		it('returns rowIndex when primaryKey not set', () => {
			const e = TestEntity.fromRow([1, 'x']) as TestEntity & {
				_rowIndex: number;
			};
			(e as any)._rowIndex = 5;
			expect(e.getPrimaryKey()).toBe(5);
		});

		it('returns primaryKey field when set', () => {
			class PkEntity extends Entity<{ uid: string }> {
				declare uid: string;
				static override config = {
					columns: { uid: 0 },
					primaryKey: 'uid',
				};
				validate(): void {}
			}
			const e = PkEntity.fromRow(['abc']) as PkEntity;
			expect(e.getPrimaryKey()).toBe('abc');
		});

		it('throws when no primaryKey and no _rowIndex', () => {
			const e = TestEntity.fromRow([1, 'x']) as TestEntity;
			expect(() => e.getPrimaryKey()).toThrow(
				'Primary key not defined and rowIndex not set'
			);
		});

		it('throws when _rowIndex is undefined', () => {
			const e = TestEntity.fromRow([1, 'x']) as TestEntity;
			(e as any)._rowIndex = undefined;
			expect(() => e.getPrimaryKey()).toThrow();
		});
	});
});
