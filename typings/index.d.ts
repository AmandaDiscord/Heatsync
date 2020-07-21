import events = require("events");
import StatWatcher = require("./StatWatcher");

declare class Reloader {
	constructor(log?: boolean, dirname?: string);

	/**
	 * The absolute path to the directory Reloader was instanciated with.
	 */
	public dirname: string;
	/**
	 * A boolean determining if Reloader should log modified/loaded filenames.
	 */
	public log: boolean;
	public watchers: Array<{ dir: string, watcher: StatWatcher }>;
	/**
	 * An EventEmitter which emits reloaded paths which are relative to the root of the directory Reloader was instantiated with
	 *
	 * @see Reloader.local
	 */
	public fileChangeEmitter: events.EventEmitter;


	private _update(reference: Reference<any>): void;

	/**
	 * Require files, add them to a watch list and return their values
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to the path Reloader was instanciated with.
	 */
	public require(filenames: Array<string>): Array<any>;

	/**
	 * Calculates a path string local from the directory Reloader was instantiated with.
	 *
	 * ​
	 *
	 * Just pass it __filename in most cases.
	 * @param {string} dir
	 */
	public local(dir: string): string;
}

declare class Reference<T> {
	constructor(path: string, value: T);

	private readonly _table: Map<string, Reference<any>>;

	public path: string;
	public value: T;


	public update(value: T): T;
}

export = Reloader;
