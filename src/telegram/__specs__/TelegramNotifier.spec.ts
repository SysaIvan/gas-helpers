import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramNotifier } from '../index';

const createMockFetch = () => ({
	getResponseCode: vi.fn(() => 200),
	getContentText: vi.fn(() => '{"ok":true}'),
});

describe('TelegramNotifier', () => {
	let fetchMock: ReturnType<typeof createMockFetch>;

	beforeEach(() => {
		fetchMock = createMockFetch();
		vi.stubGlobal('UrlFetchApp', {
			fetch: vi.fn(() => fetchMock),
		});
		vi.stubGlobal('Logger', {
			log: vi.fn(),
		});
	});

	describe('constructor', () => {
		it('creates instance with params', () => {
			const notifier = new TelegramNotifier({
				botToken: 'token123',
				chatId: 'chat456',
				spreadsheetName: 'Sheet1',
			});
			expect(notifier).toBeInstanceOf(TelegramNotifier);
		});
	});

	describe('sendNotification', () => {
		it('sends message with correct payload', () => {
			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat123',
			});
			notifier.sendNotification('test message');

			const fetch = (
				global as unknown as {
					UrlFetchApp: { fetch: ReturnType<typeof vi.fn> };
				}
			).UrlFetchApp.fetch;
			expect(fetch).toHaveBeenCalledWith(
				'https://api.telegram.org/bottoken/sendMessage',
				expect.objectContaining({
					method: 'post',
					headers: { 'Content-Type': 'application/json' },
				})
			);
			const payload = JSON.parse(fetch.mock.calls[0][1].payload);
			expect(payload).toEqual({
				chat_id: 'chat123',
				text: 'test message',
				disable_notification: true,
			});
		});

		it('prepends spreadsheetName to message when provided', () => {
			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat',
				spreadsheetName: 'MySheet',
			});
			notifier.sendNotification('hello');

			const fetch = (
				global as unknown as {
					UrlFetchApp: { fetch: ReturnType<typeof vi.fn> };
				}
			).UrlFetchApp.fetch;
			const payload = JSON.parse(fetch.mock.calls[0][1].payload);
			expect(payload.text).toBe('MySheet\nhello');
		});

		it('uses override spreadsheetName when passed as 3rd arg', () => {
			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat',
				spreadsheetName: 'DefaultSheet',
			});
			notifier.sendNotification('msg', true, 'OverrideSheet');

			const fetch = (
				global as unknown as {
					UrlFetchApp: { fetch: ReturnType<typeof vi.fn> };
				}
			).UrlFetchApp.fetch;
			const payload = JSON.parse(fetch.mock.calls[0][1].payload);
			expect(payload.text).toBe('OverrideSheet\nmsg');
		});

		it('sends disable_notification: false when passed', () => {
			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat',
			});
			notifier.sendNotification('ping', false);

			const fetch = (
				global as unknown as {
					UrlFetchApp: { fetch: ReturnType<typeof vi.fn> };
				}
			).UrlFetchApp.fetch;
			const payload = JSON.parse(fetch.mock.calls[0][1].payload);
			expect(payload.disable_notification).toBe(false);
		});

		it('logs error when response code is not 200', () => {
			fetchMock.getResponseCode.mockReturnValue(400);
			fetchMock.getContentText.mockReturnValue('Bad Request');

			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat',
			});
			notifier.sendNotification('fail');

			const Logger = (
				global as unknown as {
					Logger: { log: ReturnType<typeof vi.fn> };
				}
			).Logger;
			expect(Logger.log).toHaveBeenCalledWith(
				expect.stringContaining('400')
			);
		});

		it('catches and logs exception', () => {
			const fetch = (
				global as unknown as {
					UrlFetchApp: { fetch: ReturnType<typeof vi.fn> };
				}
			).UrlFetchApp.fetch;
			fetch.mockImplementation(() => {
				throw new Error('Network error');
			});

			const notifier = new TelegramNotifier({
				botToken: 'token',
				chatId: 'chat',
			});
			notifier.sendNotification('msg');

			const Logger = (
				global as unknown as {
					Logger: { log: ReturnType<typeof vi.fn> };
				}
			).Logger;
			expect(Logger.log).toHaveBeenCalledWith(
				expect.stringContaining('Network error')
			);
		});
	});
});
