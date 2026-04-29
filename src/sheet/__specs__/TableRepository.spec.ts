import { Entity } from '../Entity';
import { TableRepository } from '../TableRepository';

type TestData = { id: number; name: string };

const TABLE_NAME = 'TestTable';
const SHEET_ID = 42;

/** Table range: row 1 header, rows 2…endRowIndex — body (see TableRepository.load). */
type TableRange = {
	startRowIndex: number;
	endRowIndex: number;
	startColumnIndex: number;
	endColumnIndex: number;
};

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

class TestTableRepository extends TableRepository<TestData, TestEntity> {
	protected entity = TestEntity;
	protected sheetName = TABLE_NAME;
}

const defaultTableRange = (): TableRange => ({
	startRowIndex: 0,
	/** Body ends at this 1-based row; data starts at startRowIndex + 2. */
	endRowIndex: 3,
	startColumnIndex: 0,
	endColumnIndex: 2,
});

const createMockSheet = (storage: any[][], formulasStorage?: string[][]) => {
	const formulas = formulasStorage ?? storage.map((r) => r.map(() => ''));
	return {
		getSheetId: () => SHEET_ID,
		getRange: vi.fn(
			(row: number, col: number, numRows: number, numCols: number) => ({
				getValues: () => {
					const result = storage.slice(row - 1, row - 1 + numRows);
					return result.map((r) =>
						r.slice(col - 1, col - 1 + numCols)
					);
				},
				getFormulas: () => {
					const result = formulas.slice(row - 1, row - 1 + numRows);
					return result.map((r) =>
						r.slice(col - 1, col - 1 + numCols)
					);
				},
				setValues: (vals: any[][]) => {
					const start = row - 1;
					vals.forEach((v, i) => {
						if (!storage[start + i]) storage[start + i] = [];
						if (!formulas[start + i]) formulas[start + i] = [];
						v.forEach((c, j) => {
							storage[start + i][col - 1 + j] = c;
							formulas[start + i][col - 1 + j] =
								typeof c === 'string' && c.startsWith('=')
									? c
									: '';
						});
					});
				},
				clearContent: () => {
					const start = row - 1;
					for (let i = 0; i < numRows; i++) {
						if (!storage[start + i]) storage[start + i] = [];
						if (!formulas[start + i]) formulas[start + i] = [];
						for (let j = 0; j < numCols; j++) {
							storage[start + i][col - 1 + j] = '';
							formulas[start + i][col - 1 + j] = '';
						}
					}
				},
			})
		),
	};
};

type SheetsMocks = {
	getSpreadsheet: () => { sheets: any[] };
	batchUpdate: ReturnType<typeof vi.fn>;
};

const installGasMocks = (
	storage: any[][],
	mockSheet: ReturnType<typeof createMockSheet>,
	sheetsMocks: SheetsMocks
) => {
	(global as any).SpreadsheetApp = {
		getActive: () => ({
			getId: () => 'test-spreadsheet-id',
			getSheets: () => [mockSheet],
		}),
	};
	(global as any).Sheets = {
		Spreadsheets: {
			get: vi.fn(() => sheetsMocks.getSpreadsheet()),
			batchUpdate: sheetsMocks.batchUpdate,
		},
	};
};

describe('TableRepository', () => {
	let storage: any[][];
	let mockSheet: ReturnType<typeof createMockSheet>;
	let tableRange: TableRange;
	let batchUpdate: ReturnType<typeof vi.fn>;
	let getSpreadsheet: () => any;

	beforeEach(() => {
		tableRange = defaultTableRange();
		storage = [
			['ID', 'Name'],
			[1, 'Alice'],
			[2, 'Bob'],
		];
		mockSheet = createMockSheet(storage);
		batchUpdate = vi.fn();
		getSpreadsheet = () => ({
			sheets: [
				{
					properties: { sheetId: SHEET_ID },
					tables: [
						{
							tableId: 't1',
							name: TABLE_NAME,
							range: { ...tableRange },
						},
					],
				},
			],
		});
		installGasMocks(storage, mockSheet, {
			getSpreadsheet,
			batchUpdate,
		});
	});

	afterEach(() => {
		delete (global as any).SpreadsheetApp;
		delete (global as any).Sheets;
	});

	describe('constructor', () => {
		it('throws when Sheets advanced service is missing', () => {
			delete (global as any).Sheets;
			expect(() => new TestTableRepository({ soft: true })).toThrow(
				/Enable the Google Sheets advanced service/
			);
		});
	});

	describe('table / worksheet', () => {
		it('throws when table name is not found', () => {
			getSpreadsheet = () => ({
				sheets: [
					{
						properties: { sheetId: SHEET_ID },
						tables: [
							{
								tableId: 'x',
								name: 'OtherTable',
								range: tableRange,
							},
						],
					},
				],
			});
			installGasMocks(storage, mockSheet, {
				getSpreadsheet,
				batchUpdate,
			});
			const repo = new TestTableRepository({ soft: true });
			expect(() => repo.table).toThrow(/TestTable not found/);
		});

		it('resolves worksheet by sheetId', () => {
			const repo = new TestTableRepository({ soft: true });
			repo.load();
			expect(repo.worksheet).toBe(mockSheet);
		});
	});

	describe('load (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
		});

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
			tableRange = {
				startRowIndex: 0,
				endRowIndex: 1,
				startColumnIndex: 0,
				endColumnIndex: 2,
			};
			storage = [['ID', 'Name']];
			mockSheet = createMockSheet(storage);
			installGasMocks(storage, mockSheet, {
				getSpreadsheet: () => ({
					sheets: [
						{
							properties: { sheetId: SHEET_ID },
							tables: [
								{
									tableId: 't1',
									name: TABLE_NAME,
									range: { ...tableRange },
								},
							],
						},
					],
				}),
				batchUpdate,
			});
			repo = new TestTableRepository({ soft: true });
			repo.load({ fromRow: 2, toRow: 1 });
			expect(repo.findAll()).toHaveLength(0);
		});
	});

	describe('query (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
			repo.load();
		});

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

	describe('save (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
			repo.load();
		});

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

	describe('delete (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
			repo.load();
		});

		it('adds entity to toDelete', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			repo.delete(e);
			expect(repo['toDelete'].has(e)).toBe(true);
		});
	});

	describe('insert (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			tableRange = {
				startRowIndex: 0,
				endRowIndex: 10,
				startColumnIndex: 0,
				endColumnIndex: 2,
			};
			storage = [
				['ID', 'Name'],
				[1, 'Alice'],
				[2, 'Bob'],
				...Array.from({ length: 7 }, () => ['', '']),
			];
			mockSheet = createMockSheet(storage);
			installGasMocks(storage, mockSheet, {
				getSpreadsheet,
				batchUpdate,
			});
			repo = new TestTableRepository({ soft: true });
			repo.load({ fromRow: 2, toRow: 3 });
		});

		it('appends row into empty cells and updates cache', () => {
			const e = new TestEntity({ id: 3, name: 'Carol' });
			repo.insert(e);
			expect(storage[3]).toEqual([3, 'Carol']);
			expect(repo.count()).toBe(3);
			expect((e as any)._rowIndex).toBe(4);
			expect(batchUpdate).not.toHaveBeenCalled();
		});

		it('resets _original after insert', () => {
			const e = new TestEntity({ id: 3, name: 'Carol' });
			repo.insert(e);
			expect(e.isDirty()).toBe(false);
		});

		it('throws soft when not enough empty rows', () => {
			storage = [
				['ID', 'Name'],
				[1, 'Alice'],
				[2, 'Bob'],
			];
			mockSheet = createMockSheet(storage);
			tableRange = {
				startRowIndex: 0,
				endRowIndex: 3,
				startColumnIndex: 0,
				endColumnIndex: 2,
			};
			installGasMocks(storage, mockSheet, {
				getSpreadsheet: () => ({
					sheets: [
						{
							properties: { sheetId: SHEET_ID },
							tables: [
								{
									tableId: 't1',
									name: TABLE_NAME,
									range: { ...tableRange },
								},
							],
						},
					],
				}),
				batchUpdate,
			});
			repo = new TestTableRepository({ soft: true });
			repo.load();
			expect(() =>
				repo.insert(new TestEntity({ id: 3, name: 'X' }))
			).toThrow(/no enough empty rows/);
		});
	});

	describe('insertBatch (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			tableRange = {
				startRowIndex: 0,
				endRowIndex: 10,
				startColumnIndex: 0,
				endColumnIndex: 2,
			};
			storage = [
				['ID', 'Name'],
				[1, 'Alice'],
				[2, 'Bob'],
				...Array.from({ length: 7 }, () => ['', '']),
			];
			mockSheet = createMockSheet(storage);
			installGasMocks(storage, mockSheet, {
				getSpreadsheet,
				batchUpdate,
			});
			repo = new TestTableRepository({ soft: true });
			repo.load({ fromRow: 2, toRow: 3 });
		});

		it('inserts multiple rows', () => {
			const entities = [
				new TestEntity({ id: 3, name: 'Carol' }),
				new TestEntity({ id: 4, name: 'Dave' }),
			];
			repo.insertBatch(entities);
			expect(storage[3]).toEqual([3, 'Carol']);
			expect(storage[4]).toEqual([4, 'Dave']);
			expect(repo.count()).toBe(4);
		});

		it('does nothing for empty array', () => {
			const len = storage.length;
			repo.insertBatch([]);
			expect(storage.length).toBe(len);
		});

		it('inserts at fromRow when specified', () => {
			const entities = [
				new TestEntity({ id: 10, name: 'X' }),
				new TestEntity({ id: 11, name: 'Y' }),
			];
			repo.insertBatch(entities, 2);
			expect(storage[1]).toEqual([10, 'X']);
			expect(storage[2]).toEqual([11, 'Y']);
			expect((entities[0] as any)._rowIndex).toBe(2);
			expect((entities[1] as any)._rowIndex).toBe(3);
		});
	});

	describe('insert (hard default)', () => {
		it('calls Sheets batchUpdate for insertDimension', () => {
			const repo = new TestTableRepository();
			repo.load();
			repo.insert(new TestEntity({ id: 3, name: 'Z' }));
			expect(batchUpdate).toHaveBeenCalled();
			const req = batchUpdate.mock.calls[0][0].requests[0];
			expect(req.insertDimension.range.dimension).toBe('ROWS');
			expect(req.insertDimension.range.sheetId).toBe(SHEET_ID);
		});
	});

	describe('upsert (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			tableRange = {
				startRowIndex: 0,
				endRowIndex: 10,
				startColumnIndex: 0,
				endColumnIndex: 2,
			};
			storage = [
				['ID', 'Name'],
				[1, 'Alice'],
				[2, 'Bob'],
				...Array.from({ length: 7 }, () => ['', '']),
			];
			mockSheet = createMockSheet(storage);
			installGasMocks(storage, mockSheet, {
				getSpreadsheet,
				batchUpdate,
			});
			repo = new TestTableRepository({ soft: true });
			repo.load({ fromRow: 2, toRow: 3 });
		});

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

	describe('commit (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
			repo.load();
		});

		it('writes dirty entities to sheet', () => {
			const e = repo.findByRowIndex(2)! as TestEntity & {
				_rowIndex: number;
			};
			e.name = 'AliceUpdated';
			repo.save(e);
			repo.commit();
			expect(storage[1]).toEqual([1, 'AliceUpdated']);
		});

		it('preserves freezeColumns on commit', () => {
			type DataWithFormula = { id: number; source: string; name: string };
			class EntityWithFormula extends Entity<DataWithFormula> {
				declare id: number;
				declare source: string;
				declare name: string;
				static override config = {
					columns: { id: 0, source: 1, name: 2 },
					freezeColumns: ['source'] as const,
				};
				validate(): void {
					if (!this.name) throw new Error('name required');
				}
			}
			class RepoWithFormula extends TableRepository<
				DataWithFormula,
				EntityWithFormula
			> {
				protected entity = EntityWithFormula;
				protected sheetName = TABLE_NAME;
			}

			const formulaStorage = [
				['ID', 'Source', 'Name'],
				[1, 'val', 'Alice'],
				[2, 'val', 'Bob'],
			];
			const formulasStorage = [
				['', '', ''],
				['', '=IMPORTRANGE("url";"Sync!B2:B")', ''],
				['', '=IMPORTRANGE("url";"Sync!B2:B")', ''],
			];
			const wideRange: TableRange = {
				startRowIndex: 0,
				endRowIndex: 3,
				startColumnIndex: 0,
				endColumnIndex: 3,
			};
			getSpreadsheet = () => ({
				sheets: [
					{
						properties: { sheetId: SHEET_ID },
						tables: [
							{
								tableId: 't2',
								name: TABLE_NAME,
								range: { ...wideRange },
							},
						],
					},
				],
			});
			const sheetWithFormula = createMockSheet(
				formulaStorage,
				formulasStorage
			);
			installGasMocks(formulaStorage, sheetWithFormula, {
				getSpreadsheet,
				batchUpdate,
			});

			const repoFormula = new RepoWithFormula({ soft: true });
			repoFormula.load();
			const entity = repoFormula.findByRowIndex(2)!;
			entity.name = 'AliceUpdated';
			repoFormula.save(entity);
			repoFormula.commit();

			expect(formulaStorage[1][0]).toBe(1);
			expect(formulaStorage[1][2]).toBe('AliceUpdated');
			expect(formulasStorage[1][1]).toBe(
				'=IMPORTRANGE("url";"Sync!B2:B")'
			);
		});

		it('does not overwrite columns not loaded (projection)', () => {
			type FourCol = { a: number; b: string; c: number; d: string };
			class FourColEntity extends Entity<FourCol> {
				declare a: number;
				declare b: string;
				declare c: number;
				declare d: string;
				static override config = {
					columns: { a: 0, b: 1, c: 2, d: 3 },
				};
				validate(): void {
					if (this.d === undefined) throw new Error('d required');
				}
			}
			class FourColRepo extends TableRepository<FourCol, FourColEntity> {
				protected entity = FourColEntity;
				protected sheetName = TABLE_NAME;
			}

			const fourStorage = [
				['A', 'B', 'C', 'D'],
				[10, 'x', 1, 'Alice'],
				[20, 'y', 2, 'Bob'],
			];
			const fourRange: TableRange = {
				startRowIndex: 0,
				endRowIndex: 3,
				startColumnIndex: 0,
				endColumnIndex: 4,
			};
			mockSheet = createMockSheet(fourStorage);
			installGasMocks(fourStorage, mockSheet, {
				getSpreadsheet: () => ({
					sheets: [
						{
							properties: { sheetId: SHEET_ID },
							tables: [
								{
									tableId: 't4',
									name: TABLE_NAME,
									range: { ...fourRange },
								},
							],
						},
					],
				}),
				batchUpdate,
			});

			const repo4 = new FourColRepo({ soft: true });
			repo4.load({ columns: ['c', 'd'] });
			const e = repo4.findByRowIndex(2)!;
			e.d = 'AliceUpdated';
			repo4.save(e);
			repo4.commit();

			expect(fourStorage[1][0]).toBe(10);
			expect(fourStorage[1][1]).toBe('x');
			expect(fourStorage[1][2]).toBe(1);
			expect(fourStorage[1][3]).toBe('AliceUpdated');
		});

		it('clears row content on soft delete commit', () => {
			const e = repo.findByRowIndex(3)! as TestEntity & {
				_rowIndex: number;
			};
			repo.delete(e);
			repo.commit();
			expect(storage[2]).toEqual(['', '']);
			expect(repo.findByRowIndex(3)).toBeNull();
		});

		it('does not reload cache when refresh is false (default)', () => {
			const loadSpy = vi.spyOn(repo, 'load');
			const e = repo.findByRowIndex(2)!;
			e.name = 'AliceUpdated';
			repo.save(e);
			repo.commit();
			expect(loadSpy).not.toHaveBeenCalled();
			expect(storage[1]).toEqual([1, 'AliceUpdated']);
		});

		it('reloads cache when refresh is true', () => {
			const loadSpy = vi.spyOn(repo, 'load');
			const e = repo.findByRowIndex(2)!;
			e.name = 'AliceUpdated';
			repo.save(e);
			repo.commit({ refresh: true });
			expect(loadSpy).toHaveBeenCalledTimes(1);
			expect(repo.findAll()[0].name).toBe('AliceUpdated');
		});
	});

	describe('commitDeletes (hard)', () => {
		it('calls batchUpdate for deleteDimension', () => {
			const repo = new TestTableRepository();
			repo.load();
			const e = repo.findByRowIndex(3)! as TestEntity & {
				_rowIndex: number;
			};
			repo.delete(e);
			repo.commit();
			expect(batchUpdate).toHaveBeenCalled();
			const req = batchUpdate.mock.calls.at(-1)![0].requests[0];
			expect(req.deleteDimension.range.dimension).toBe('ROWS');
		});
	});

	describe('clear (soft)', () => {
		let repo: TestTableRepository;

		beforeEach(() => {
			repo = new TestTableRepository({ soft: true });
			repo.load();
		});

		it('clears body cells and cache', () => {
			repo.clear();
			expect(storage[0]).toEqual(['ID', 'Name']);
			expect(storage[1]).toEqual(['', '']);
			expect(storage[2]).toEqual(['', '']);
			expect(repo.count()).toBe(0);
			expect(repo['dirty'].size).toBe(0);
			expect(repo['toDelete'].size).toBe(0);
			expect(batchUpdate).not.toHaveBeenCalled();
		});

		it('clears only specified columns when options.columns provided', () => {
			repo.clear({ columns: ['name'] });
			expect(storage[0]).toEqual(['ID', 'Name']);
			expect(storage[1]).toEqual([1, '']);
			expect(storage[2]).toEqual([2, '']);
			expect(repo.count()).toBe(0);
		});
	});

	describe('clear (hard: no columns)', () => {
		it('calls deleteDimension for all data rows', () => {
			const repo = new TestTableRepository();
			repo.load();
			repo.clear();
			expect(batchUpdate).toHaveBeenCalled();
			const req = batchUpdate.mock.calls[0][0].requests[0];
			expect(req.deleteDimension).toBeDefined();
			expect(repo.count()).toBe(0);
		});
	});
});
