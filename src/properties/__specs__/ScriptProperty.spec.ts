import { ScriptProperty } from '../index';

describe('ScriptProperty', () => {
	let store: Record<string, string>;
	let getPropertySpy: ReturnType<typeof vi.fn>;
	let setPropertySpy: ReturnType<typeof vi.fn>;
	let deletePropertySpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		store = {};
		getPropertySpy = vi.fn((key: string) => store[key] ?? null);
		setPropertySpy = vi.fn((key: string, value: string) => {
			store[key] = value;
		});
		deletePropertySpy = vi.fn((key: string) => {
			delete store[key];
		});

		(global as any).PropertiesService = {
			getScriptProperties: () => ({
				getProperty: getPropertySpy,
				setProperty: setPropertySpy,
				deleteProperty: deletePropertySpy,
			}),
		};
	});

	afterEach(() => {
		delete (global as any).PropertiesService;
	});

	describe('get', () => {
		it('returns null when property is not set', () => {
			const prop = new ScriptProperty<{ x: number }>('my_key');
			expect(prop.get()).toBe(null);
		});

		it('returns parsed object when property exists', () => {
			store['my_key'] = JSON.stringify({ x: 42 });
			const prop = new ScriptProperty<{ x: number }>('my_key');
			expect(prop.get()).toEqual({ x: 42 });
		});

		it('returns defaults when property is not set and defaults provided', () => {
			const defaults = { status: 'idle' };
			const prop = new ScriptProperty<{ status: string }>(
				'my_key',
				defaults
			);
			expect(prop.get()).toEqual(defaults);
		});

		it('returns defaults when JSON parse fails', () => {
			store['my_key'] = 'invalid json';
			const defaults = { x: 0 };
			const prop = new ScriptProperty<{ x: number }>('my_key', defaults);
			expect(prop.get()).toEqual(defaults);
		});
	});

	describe('set', () => {
		it('serializes and stores value', () => {
			const prop = new ScriptProperty<{ a: number }>('key');
			prop.set({ a: 1 });
			expect(setPropertySpy).toHaveBeenCalledWith('key', '{"a":1}');
			expect(prop.get()).toEqual({ a: 1 });
		});
	});

	describe('delete', () => {
		it('removes property', () => {
			store['key'] = '{"x":1}';
			const prop = new ScriptProperty<{ x: number }>('key');
			prop.delete();
			expect(deletePropertySpy).toHaveBeenCalledWith('key');
			expect(prop.get()).toBe(null);
		});
	});

	describe('exists', () => {
		it('returns true when property exists', () => {
			store['key'] = 'value';
			const prop = new ScriptProperty('key');
			expect(prop.exists()).toBe(true);
		});

		it('returns false when property is missing', () => {
			const prop = new ScriptProperty('key');
			expect(prop.exists()).toBe(false);
		});
	});

	describe('getOrDefault', () => {
		it('returns stored value when exists', () => {
			store['key'] = JSON.stringify({ x: 5 });
			const prop = new ScriptProperty<{ x: number }>('key');
			expect(prop.getOrDefault({ x: 0 })).toEqual({ x: 5 });
		});

		it('returns def when value is missing', () => {
			const prop = new ScriptProperty<{ x: number }>('key');
			expect(prop.getOrDefault({ x: 99 })).toEqual({ x: 99 });
		});

		it('returns constructor defaults when def omitted', () => {
			const defaults = { status: 'idle' };
			const prop = new ScriptProperty('key', defaults);
			expect(prop.getOrDefault()).toEqual(defaults);
		});

		it('throws when value missing and no defaults', () => {
			const prop = new ScriptProperty<{ x: number }>('key');
			expect(() => prop.getOrDefault()).toThrow(
				'ScriptProperty "key" has no value and no defaults'
			);
		});
	});
});
