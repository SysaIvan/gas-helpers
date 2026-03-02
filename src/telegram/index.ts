/** Parameters for TelegramNotifier constructor */
export type TelegramNotifierParams = {
	/** Bot token from @BotFather */
	botToken: string;
	/** Chat ID for sending messages */
	chatId: string;
	/** Spreadsheet name — prepended to messages (optional) */
	spreadsheetName?: string;
};

/**
 * Sends notifications to Telegram via Bot API.
 * Uses UrlFetchApp for HTTP requests.
 */
export class TelegramNotifier {
	private readonly apiUrl: string;
	private readonly chatId: string;
	private readonly spreadsheetName: string;

	/**
	 * @param params - botToken, chatId, spreadsheetName (optional)
	 */
	constructor(params: TelegramNotifierParams) {
		const { botToken, chatId, spreadsheetName = '' } = params;
		this.apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
		this.chatId = chatId;
		this.spreadsheetName = spreadsheetName;
	}

	/**
	 * Sends a message to Telegram. Logs errors; does not throw.
	 * @param message - Message text
	 * @param disableNotification - Mute notification sound (default true)
	 * @param spreadsheetName - Spreadsheet name prefix (default from constructor)
	 * @example notifier.sendNotification('Error in script');
	 */
	sendNotification(
		message: string,
		disableNotification: boolean = true,
		spreadsheetName = this.spreadsheetName
	): void {
		try {
			const text = spreadsheetName
				? `${spreadsheetName}\n${message}`
				: message;
			const payload = {
				chat_id: this.chatId,
				text,
				disable_notification: disableNotification,
			};
			const response = UrlFetchApp.fetch(this.apiUrl, {
				method: 'post',
				headers: {
					'Content-Type': 'application/json',
				},
				payload: JSON.stringify(payload),
				muteHttpExceptions: true,
			});
			const responseCode = response.getResponseCode();
			if (responseCode !== 200) {
				const responseText = response.getContentText();
				Logger.log(
					`Error sending message to Telegram: ${responseCode} - ${responseText}`
				);
			} else {
				Logger.log(`Message sent to Telegram: ${message}`);
			}
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			Logger.log(`Error sending message to Telegram: ${errorMsg}`);
		}
	}
}
