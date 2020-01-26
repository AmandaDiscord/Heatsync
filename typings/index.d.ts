import events = require("events");

declare class Reloader {
	constructor(log?: boolean, dirname?: string);

	public dirname: string;
	public watched: Map<string, any>;
	public syncers: Array<{ filename: string; object: any }>;
	/**
	 * An EventEmitter which emits reloaded filenames
	 */
	public reloadEvent: events.EventEmitter;
	public log: boolean;

	private _update(filename: string): void;

	/**
	 * Watch an Array of relative paths to files but do not require them immediately.
	 */
	public watch(filenames: Array<string>): this;
	/**
	 * Watch an Array of relative paths to files and require them immediately
	 */
	public watchAndLoad(filenames: Array<string>): this;
	/**
	 * Sync results with a watched file to an Object
	 */
	public sync(filename: string, object: any): this;
}
export = Reloader;
