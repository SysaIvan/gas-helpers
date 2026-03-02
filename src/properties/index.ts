/**
 * Type-safe wrapper for PropertiesService.getScriptProperties().
 * Stores values as JSON. Use for script state, not configuration.
 *
 * @template T - Stored value type (typically an object)
 */
export class ScriptProperty<T> {
	constructor(
		private readonly key: string,
		private readonly defaults?: T
	) {}

	/**
	 * Reads value from script properties.
	 * @returns Parsed value or null if not set (or defaults if provided in constructor)
	 */
	get = (): T | null => {
		const raw = PropertiesService.getScriptProperties().getProperty(
			this.key
		);
		if (raw === null || raw === undefined) return this.defaults ?? null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return this.defaults ?? null;
		}
	};

	/**
	 * Writes value to script properties.
	 * @param value - Value to store (serialized as JSON)
	 */
	set = (value: T): void => {
		PropertiesService.getScriptProperties().setProperty(
			this.key,
			JSON.stringify(value)
		);
	};

	/**
	 * Removes the property.
	 */
	delete = (): void => {
		PropertiesService.getScriptProperties().deleteProperty(this.key);
	};

	/**
	 * Checks if the property exists (non-empty value).
	 */
	exists = (): boolean => {
		const raw = PropertiesService.getScriptProperties().getProperty(
			this.key
		);
		return raw !== null && raw !== undefined;
	};

	/**
	 * Returns stored value or fallback. Uses constructor defaults when def is omitted.
	 * @param def - Override when no defaults in constructor; required if no defaults
	 * @throws Error when value is missing and neither def nor constructor defaults provided
	 */
	getOrDefault = (def?: T): T => {
		const value = this.get();
		if (value !== null) return value;
		if (def !== undefined) return def;
		if (this.defaults !== undefined) return this.defaults;
		throw new Error(
			`ScriptProperty "${this.key}" has no value and no defaults`
		);
	};
}
