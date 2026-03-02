/**
 * Utilities for Google Sheets UI (alert, confirm, prompt dialogs).
 * Methods safely check UI availability (e.g. when running from a trigger).
 */
export class Ui {
	/**
	 * Checks if Spreadsheet UI is available (e.g. when document is open by user).
	 * UI is NOT available when running from triggers, onEdit, or time-driven scripts.
	 * @returns true if UI is available
	 * @example
	 * if (Ui.isAvailable()) Ui.alert('Hello');
	 */
	static isAvailable = (): boolean => {
		try {
			SpreadsheetApp.getUi();
			return true;
		} catch {
			return false;
		}
	};

	/**
	 * Shows an alert dialog. No-op if UI unavailable.
	 * @param message - Message text
	 * @example Ui.alert('Done');
	 */
	static alert = (message: string): void => {
		if (!Ui.isAvailable()) return;
		SpreadsheetApp.getUi().alert(message);
	};

	/**
	 * Shows a confirm dialog (OK/Cancel).
	 * @param title - Dialog title
	 * @param message - Message text
	 * @returns true if user clicked OK
	 */
	static confirm = (title: string, message: string): boolean => {
		if (!Ui.isAvailable()) return false;
		const ui = SpreadsheetApp.getUi();
		return (
			ui.alert(title, message, ui.ButtonSet.OK_CANCEL) === ui.Button.OK
		);
	};

	/**
	 * Shows a prompt dialog for text input.
	 * @param title - Dialog title
	 * @param message - Prompt hint
	 * @returns Entered text or null if cancelled
	 */
	static prompt = (title: string, message: string): string | null => {
		if (!Ui.isAvailable()) return null;
		const ui = SpreadsheetApp.getUi();
		const result = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
		return result.getSelectedButton() === ui.Button.OK
			? result.getResponseText()
			: null;
	};
}
