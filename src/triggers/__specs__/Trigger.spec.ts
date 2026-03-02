import { Trigger } from '../index';

const createMockTrigger = (handlerFn: string) => ({
	getHandlerFunction: () => handlerFn,
	getTriggerSource: () => (global as any).ScriptApp.TriggerSource.CLOCK,
});

describe('Trigger', () => {
	let triggers: ReturnType<typeof createMockTrigger>[];
	let deleteTriggerSpy: ReturnType<typeof vi.fn>;
	let newTriggerBuilder: {
		timeBased: ReturnType<typeof vi.fn>;
		after: ReturnType<typeof vi.fn>;
		everyMinutes: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		triggers = [];
		deleteTriggerSpy = vi.fn();

		const createSpy = vi.fn(() => newTriggerBuilder);

		newTriggerBuilder = {
			timeBased: vi.fn(() => newTriggerBuilder),
			after: vi.fn(() => newTriggerBuilder),
			everyMinutes: vi.fn(() => newTriggerBuilder),
			create: vi.fn(),
		};

		(global as any).ScriptApp = {
			getProjectTriggers: () => triggers,
			deleteTrigger: deleteTriggerSpy,
			newTrigger: createSpy,
			TriggerSource: { CLOCK: 'CLOCK' },
		};

		(global as any).Logger = { log: vi.fn() };
	});

	afterEach(() => {
		delete (global as any).ScriptApp;
		delete (global as any).Logger;
	});

	describe('has', () => {
		it('returns true when matching clock trigger exists', () => {
			triggers = [createMockTrigger('myFn') as any];
			const service = new Trigger('myFn');
			expect(service.has()).toBe(true);
		});

		it('returns false when no matching trigger', () => {
			triggers = [createMockTrigger('otherFn') as any];
			const service = new Trigger('myFn');
			expect(service.has()).toBe(false);
		});

		it('returns false when triggers array is empty', () => {
			const service = new Trigger('myFn');
			expect(service.has()).toBe(false);
		});
	});

	describe('delete', () => {
		it('deletes first matching trigger', () => {
			const t = createMockTrigger('myFn') as any;
			triggers = [t];
			const service = new Trigger('myFn');
			service.delete();
			expect(deleteTriggerSpy).toHaveBeenCalledWith(t);
		});

		it('does nothing when no matching trigger', () => {
			triggers = [createMockTrigger('otherFn') as any];
			const service = new Trigger('myFn');
			service.delete();
			expect(deleteTriggerSpy).not.toHaveBeenCalled();
		});
	});

	describe('deleteAll', () => {
		it('deletes all matching triggers', () => {
			const t1 = createMockTrigger('myFn') as any;
			const t2 = createMockTrigger('myFn') as any;
			const t3 = createMockTrigger('other') as any;
			triggers = [t1, t2, t3];
			const service = new Trigger('myFn');
			service.deleteAll();
			expect(deleteTriggerSpy).toHaveBeenCalledTimes(2);
			expect(deleteTriggerSpy).toHaveBeenCalledWith(t1);
			expect(deleteTriggerSpy).toHaveBeenCalledWith(t2);
		});
	});

	describe('set', () => {
		it('removes old triggers when removeOld is true', () => {
			const t = createMockTrigger('myFn') as any;
			triggers = [t];
			const service = new Trigger('myFn');
			service.set(5, true);
			expect(deleteTriggerSpy).toHaveBeenCalledWith(t);
		});

		it('creates trigger with correct after ms', () => {
			const service = new Trigger('myFn');
			service.set(5, false);
			expect(newTriggerBuilder.after).toHaveBeenCalledWith(300000);
		});

		it('does not delete when removeOld is false', () => {
			const t = createMockTrigger('myFn') as any;
			triggers = [t];
			const service = new Trigger('myFn');
			service.set(5, false);
			expect(deleteTriggerSpy).not.toHaveBeenCalled();
		});
	});

	describe('setRecurring', () => {
		it('does nothing when trigger already exists', () => {
			triggers = [createMockTrigger('myFn') as any];
			const service = new Trigger('myFn');
			service.setRecurring(15);
			expect(newTriggerBuilder.create).not.toHaveBeenCalled();
		});

		it('creates recurring trigger when none exists', () => {
			const service = new Trigger('myFn');
			service.setRecurring(15);
			expect(newTriggerBuilder.everyMinutes).toHaveBeenCalledWith(15);
			expect(newTriggerBuilder.create).toHaveBeenCalled();
		});
	});
});
