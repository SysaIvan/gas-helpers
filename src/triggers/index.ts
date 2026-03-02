/**
 * Manages time-based triggers in Google Apps Script.
 * Create, check and delete triggers by handler function name.
 */
export class Trigger {
	/**
	 * @param functionName - Name of the trigger handler function
	 */
	constructor(private readonly functionName: string) {}

	/**
	 * Checks if a clock trigger exists for this function.
	 * @returns true if trigger exists
	 */
	has = () =>
		ScriptApp.getProjectTriggers().some(
			(t) =>
				t.getHandlerFunction() === this.functionName &&
				t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK
		);

	/** Deletes one trigger for this function. */
	delete = () => {
		const trigger = ScriptApp.getProjectTriggers().find(
			(t) => t.getHandlerFunction() === this.functionName
		);
		if (trigger) ScriptApp.deleteTrigger(trigger);
	};

	/** Deletes all triggers for this function. */
	deleteAll = () => {
		ScriptApp.getProjectTriggers().forEach((t) => {
			if (t.getHandlerFunction() === this.functionName) {
				ScriptApp.deleteTrigger(t);
			}
		});
	};

	/**
	 * Creates a one-time trigger to run after specified minutes.
	 * @param afterMinutes - Minutes until execution
	 * @param removeOld - Remove existing triggers before creating (default true)
	 * @example trigger.set(5); // run myHandler in 5 minutes
	 */
	set = (afterMinutes: number, removeOld: boolean = true) => {
		if (removeOld) this.deleteAll();
		ScriptApp.newTrigger(this.functionName)
			.timeBased()
			.after(afterMinutes * 60 * 1000)
			.create();
	};

	/**
	 * Creates a recurring trigger. Skips if one already exists.
	 * @param intervalMinutes - Interval in minutes (skips if trigger already exists)
	 * @example trigger.setRecurring(60); // every hour
	 */
	setRecurring = (intervalMinutes: number) => {
		if (this.has()) return;
		ScriptApp.newTrigger(this.functionName)
			.timeBased()
			.everyMinutes(intervalMinutes)
			.create();
		Logger.log(
			`[setRecurringTrigger] Created ${this.functionName} (every ${intervalMinutes} min)`
		);
	};
}
