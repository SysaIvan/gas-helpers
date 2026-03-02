import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ui } from '../index';

describe('Ui', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	describe('isAvailable', () => {
		it('returns true when getUi does not throw', () => {
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({})),
			});
			expect(Ui.isAvailable()).toBe(true);
		});

		it('returns false when getUi throws', () => {
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => {
					throw new Error('Authorization required');
				}),
			});
			expect(Ui.isAvailable()).toBe(false);
		});
	});

	describe('alert', () => {
		it('calls ui.alert when UI available', () => {
			const alertMock = vi.fn();
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({ alert: alertMock })),
			});
			Ui.alert('Hello');
			expect(alertMock).toHaveBeenCalledWith('Hello');
		});

		it('does nothing when UI unavailable', () => {
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => {
					throw new Error('No UI');
				}),
			});
			expect(() => Ui.alert('Hello')).not.toThrow();
		});
	});

	describe('confirm', () => {
		it('returns true when user selects OK', () => {
			const ButtonSet = { OK_CANCEL: 'OK_CANCEL' };
			const Button = { OK: 'OK', CANCEL: 'CANCEL' };
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({
					ButtonSet,
					Button,
					alert: vi.fn(() => Button.OK),
				})),
			});
			expect(Ui.confirm('Title', 'Message')).toBe(true);
		});

		it('returns false when user selects Cancel', () => {
			const ButtonSet = { OK_CANCEL: 'OK_CANCEL' };
			const Button = { OK: 'OK', CANCEL: 'CANCEL' };
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({
					ButtonSet,
					Button,
					alert: vi.fn(() => Button.CANCEL),
				})),
			});
			expect(Ui.confirm('Title', 'Message')).toBe(false);
		});

		it('returns false when UI unavailable', () => {
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => {
					throw new Error('No UI');
				}),
			});
			expect(Ui.confirm('Title', 'Message')).toBe(false);
		});
	});

	describe('prompt', () => {
		it('returns response text when user selects OK', () => {
			const ButtonSet = { OK_CANCEL: 'OK_CANCEL' };
			const Button = { OK: 'OK', CANCEL: 'CANCEL' };
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({
					ButtonSet,
					Button,
					prompt: vi.fn(() => ({
						getSelectedButton: () => Button.OK,
						getResponseText: () => 'user input',
					})),
				})),
			});
			expect(Ui.prompt('Title', 'Message')).toBe('user input');
		});

		it('returns null when user selects Cancel', () => {
			const ButtonSet = { OK_CANCEL: 'OK_CANCEL' };
			const Button = { OK: 'OK', CANCEL: 'CANCEL' };
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => ({
					ButtonSet,
					Button,
					prompt: vi.fn(() => ({
						getSelectedButton: () => Button.CANCEL,
						getResponseText: () => '',
					})),
				})),
			});
			expect(Ui.prompt('Title', 'Message')).toBe(null);
		});

		it('returns null when UI unavailable', () => {
			vi.stubGlobal('SpreadsheetApp', {
				getUi: vi.fn(() => {
					throw new Error('No UI');
				}),
			});
			expect(Ui.prompt('Title', 'Message')).toBe(null);
		});
	});
});
