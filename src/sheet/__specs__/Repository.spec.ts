import { Entity } from '../Entity';
import { Repository } from '../Repository';

type TestData = { id: number; name: string };

class TestEntity extends Entity<TestData> {
	declare id: number;
	declare name: string;

	static override config = {
		columns: { id: 0, name: 1 },
	};

	validate(): void {
		if (!this.name) throw new Error('name required');
	}
}

class TestRepository extends Repository<TestData, TestEntity> {
	protected entity = TestEntity;
	protected sheetName = 'TestSheet';
}

const createMockSheet = (storage: any[][]) => {
	return {
		getRange: vi.fn(
			(row: number, col: number, numRows: number, numCols: number) => ({
				getValues: () => {
					const result = storage.slice(row - 1, row - 1 + numRows);
					return result.map((r) =>
						r.slice(col - 1, col - 1 + numCols)
					);
				},
				setValues: (vals: any[][]) => {
					const start = row - 1;
					vals.forEach((v, i) => {
						if (!storage[start + i]) storage[start + i] = [];
						v.forEach((c, j) => {
							storage[start + i][col - 1 + j] = c;
						});
					});
				},
				clearContent: () => {
					const start = row - 1;
					for (let i = 0; i < numRows; i++) {
						if (!storage[start + i]) storage[start + i] = [];
						for (let j = 0; j < numCols; j++) {
							storage[start + i][col - 1 + j] = '';
						}
					}
				},
			})
		),
		getLastRow: vi.fn(() => storage.length),
		deleteRow: vi.fn((row: number) => {
			storage.splice(row - 1, 1);
		}),
		deleteRows: vi.fn((row: number, count: number) => {
			storage.splice(row - 1, count);
		}),
	};
};

describe('BaseSheetRepository', () => {
	let storage: any[][];
	let mockSheet: ReturnType<typeof createMockSheet>;
	let repo: TestRepository;

	beforeEach(() => {
		storage = [
			['ID', 'Name'],
			[1, 'Alice'],
			[2, 'Bob'],
		];
		mockSheet = createMockSheet(storage);
		(global as any).SpreadsheetApp = {
			getActive: () => ({
				getSheetByName: (name: string) => {
					if (name === 'TestSheet') return mockSheet;
					return null;
				},
			}),
		};

		repo = new TestRepository();
	});

	afterEach(() => {
		delete (global as any).SpreadsheetApp;
	});

	describe('load', () => {
		it('loads entities into cache', () => {
			repo.load();
			const all = repo.findAll();
			expect(all).toHaveLength(2);
			expect(all[0].id).toBe(1);
			expect(all[0].name).toBe('Alice');
			expect(all[1].id).toBe(2);
			expect(all[1].name).toBe('Bob');
		});

		it('sets _rowIndex on loaded entities', () => {
			repo.load();
			const e = repo.findByRowIndex(2);
			expect(e).not.toBeNull();
			expect((e as any)._rowIndex).toBe(2);
		});

		it('does nothing when toRow < fromRow', () => {
			storage = [['ID', 'Name']];
			mockSheet = createMockSheet(storage);
			repo.load({ fromRow: 2, toRow: 1 });
			expect(repo.findAll()).toHaveLength(0);
		});
	});

	describe('query', () => {
		beforeEach(() => repo.load());

		it('findByRowIndex returns entity or null', () => {
			expect(repo.findByRowIndex(2)?.name).toBe('Alice');
			expect(repo.findByRowIndex(99)).toBeNull();
		});

		it('findBy returns matching entities', () => {
			const found = repo.findBy('name', 'Bob');
			expect(found).toHaveLength(1);
			expect(found[0].id).toBe(2);
		});

		it('findOne returns first match or null', () => {
			expect(repo.findOne('name', 'Alice')?.id).toBe(1);
			expect(repo.findOne('name', 'Zzz')).toBeNull();
		});

		it('exists returns boolean', () => {
			expect(repo.exists('name', 'Alice')).toBe(true);
			expect(repo.exists('name', 'Zzz')).toBe(false);
		});

		it('count returns cache length', () => {
			expect(repo.count()).toBe(2);
		});

		it('countBy returns filtered count', () => {
			expect(repo.countBy('name', 'Bob')).toBe(1);
			expect(repo.countBy('name', 'Zzz')).toBe(0);
		});
	});

	describe('save', () => {
		beforeEach(() => repo.load());

		it('adds to dirty only when isDirty', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			e.name = 'Alice2';
			repo.save(e);
			expect(repo['dirty'].has(e)).toBe(true);
		});

		it('does not add when not dirty', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			// eslint-disable-next-line no-self-assign
			e.name = e.name;
			expect(e.isDirty()).toBe(false);
			repo.save(e);
			expect(repo['dirty'].size).toBe(0);
		});
	});

	describe('delete', () => {
		beforeEach(() => repo.load());

		it('adds entity to toDelete', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			repo.delete(e);
			expect(repo['toDelete'].has(e)).toBe(true);
		});
	});

	describe('insert', () => {
		beforeEach(() => repo.load());

		it('appends row and updates cache', () => {
			const e = new TestEntity({ id: 3, name: 'Carol' });
			repo.insert(e);
			expect(storage).toHaveLength(4);
			expect(storage[3]).toEqual([3, 'Carol']);
			expect(repo.count()).toBe(3);
			expect((e as any)._rowIndex).toBe(4);
		});

		it('resets _original after insert', () => {
			const e = new TestEntity({ id: 3, name: 'Carol' });
			repo.insert(e);
			expect(e.isDirty()).toBe(false);
		});
	});

	describe('insertBatch', () => {
		beforeEach(() => repo.load());

		it('inserts multiple rows', () => {
			const entities = [
				new TestEntity({ id: 3, name: 'Carol' }),
				new TestEntity({ id: 4, name: 'Dave' }),
			];
			repo.insertBatch(entities);
			expect(storage).toHaveLength(5);
			expect(storage[3]).toEqual([3, 'Carol']);
			expect(storage[4]).toEqual([4, 'Dave']);
			expect(repo.count()).toBe(4);
		});

		it('does nothing for empty array', () => {
			const len = storage.length;
			repo.insertBatch([]);
			expect(storage.length).toBe(len);
		});
	});

	describe('upsert', () => {
		beforeEach(() => repo.load());

		it('calls save when _rowIndex set', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			e.name = 'Alice2';
			repo.upsert(e);
			expect(repo['dirty'].has(e)).toBe(true);
		});

		it('calls insert when _rowIndex not set', () => {
			const e = new TestEntity({ id: 3, name: 'New' });
			repo.upsert(e);
			expect(repo.count()).toBe(3);
			expect(storage[3]).toEqual([3, 'New']);
		});
	});

	describe('commit', () => {
		beforeEach(() => repo.load());

		it('writes dirty entities to sheet', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			e.name = 'AliceUpdated';
			repo.save(e);
			repo.commit();
			expect(storage[1]).toEqual([1, 'AliceUpdated']);
		});

		it('removes toDelete rows', () => {
			const e = repo.findByRowIndex(3)! as TestEntity & {
				_rowIndex: number;
			};
			repo.delete(e);
			repo.commit();
			expect(storage[0]).toEqual(['ID', 'Name']);
			expect(storage[1]).toEqual([1, 'Alice']);
			expect(storage[2]).toEqual(['', '']);
		});
	});

	describe('clear', () => {
		beforeEach(() => repo.load());

		it('deletes all data rows and clears cache', () => {
			repo.clear();
			expect(storage[0]).toEqual(['ID', 'Name']);
			expect(storage[1]).toEqual(['', '']);
			expect(storage[2]).toEqual(['', '']);
			expect(repo.count()).toBe(0);
			expect(repo['dirty'].size).toBe(0);
			expect(repo['toDelete'].size).toBe(0);
		});
	});
});
