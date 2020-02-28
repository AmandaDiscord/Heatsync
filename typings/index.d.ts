import events = require("events");
import StatWatcher = require("./StatWatcher");

declare class Reloader {
	constructor(log?: boolean, dirname?: string);

	public dirname: string;
	public watched: Map<string, StatWatcher>;
	public syncers: Array<{ filename: string; object: any }>;
	/**
	 * An EventEmitter which emits reloaded filenames
	 */
	public reloadEvent: events.EventEmitter;
	public log: boolean;

	private _update(filename: string): void;

	/**
	 * Watch an Array of paths to files but do not require them immediately.
	 */
	public watch(filenames: Array<string>): this;
	/**
	 * Watch an Array of paths to files and require them immediately
	 */
	public watchAndLoad(filenames: Array<string>): this;
	/**
	 * Sync results with a watched file to an Object
	 */
	public sync(filename: string, object: any): this;
	/**
	 * Force a path to a file to reload
	 */
	public resync(filename: string): this;
}
export = Reloader;
