import events = require("events");
import StatWatcher = require("./StatWatcher");

declare class Reloader {
	constructor(log?: boolean, dirname?: string);

	public dirname: string;
	/**
	 * A Map keyed by absolute file paths which are being watched by Reloader.
	 */
	public watched: Map<string, StatWatcher>;
	/**
	 * An Array of Objects representing files being synced by the sync method with a property object representing said file's state
	 */
	public syncers: Array<{ filename: string; object: any }>;
	/**
	 * An EventEmitter which emits reloaded filenames
	 */
	public reloadEvent: events.EventEmitter;
	public log: boolean;

	private _update(filename: string): void;

	/**
	 * Watch an Array of paths to files but do not require them immediately.
	 * When using relative paths with this method, you must make them relative to path reloader was instanciated with
	 */
	public watch(filenames: Array<string>): this;
	/**
	 * Watch an Array of paths to files and require them immediately.
	 * When using relative paths with this method, you must make them relative to the path reloader was instanciated with
	 */
	public watchAndLoad(filenames: Array<string>): this;
	/**
	 * Sync results with a watched file to an Object.
	 * When using relative paths with this method, you must make them relative to the path reloader was instanciated with
	 */
	public sync(filename: string, object: any): this;
	/**
	 * Force a path to a file to reload.
	 * When using relative paths with this method, you must make them relative to the path reloader was instanciated with
	 */
	public resync(filename: string): this;
}
export = Reloader;
