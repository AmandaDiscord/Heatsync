import fs = require("fs");
import { EventEmitter } from "events";

/**
 * This will be fs.watch or fs.watchFile
 */
type WatchFunction = (path: string, options: fs.WatchFileOptions & {
	bigint?: false;
}, cb: (...args: any[]) => any) => any;
type Class = abstract new (...args: any) => any;
type SyncOptions = {
	/** If modules imported from HeatSync should watch for changes made to said module to automatically reload them when changed. Defaults to true. */
	watchFS?: boolean;
	/** From fs.WatchFileOptions: If the process should keep running while files are being watched. Defaults to false. */
	persistentWatchers?: boolean;
	/** What function to use for watching files if watchFS is true. Defaults to fs.watch which can be unreliable on linux. Can be fs.watch or fs.watchFile or some other wrapped function. */
	watchFunction?: WatchFunction;
	/** How long in ms HeatSync should wait before finalizing a reload of a file. This is for when files are modified in chunks and the watchFunction emits multiple events while modifying. Defaults to 1000 */
	watchDebounceMS?: number;
};

declare class Sync {
	/**
	 * An EventEmitter which emits absolute reloaded file paths.
	 */
	events: EventEmitter<any>;
	/**
	 * A class you can extend from to allow your class's methods to be reloadable.
	 * See sync.reloadClassMethods for more info.
	 */
	ReloadableClass: Class;

	constructor(options?: SyncOptions);
	/**
	 * Require a file and optionally watch it for updates from the filesystem to reload on change.
	 * Modules imported MUST export an Object. A hard reference to the original Object only is held and subsequent updates add properties from the new Object
	 * to the old one, deleting the old ones to be garbage collected.
	 *
	 * The return value is any, because TypeScript doesn't like dynamically typed return values for require.
	 * It expects a string literal and cannot be a Generic extending "" either.
	 *
	 * You will have to type the return value yourself if typings are important to you.
	 */
	require<T = any>(id: string): T;
	require<T = Array<any>>(id: Array<string>): T;
	require<T = any>(id: string, _from: string): T;

	/**
	 * Import a file and optionally watch it for updates from the filesystem to reload on change.
	 * Modules imported MUST export an Object. A hard reference to the original Object only is held and subsequent updates add properties from the new Object
	 * to the old one, deleting the old ones to be garbage collected.
	 *
	 * The return value is any, because TypeScript doesn't like dynamically typed return values for import.
	 * It expects a string literal and cannot be a Generic extending "" either.
	 *
	 * You will have to type the return value yourself if typings are important to you.
	 */
	import<T = any>(id: string, importAttributes?: ImportAttributes): Promise<T>;
	import<T = Array<any>>(id: Array<string>, importAttributes?: ImportAttributes): Promise<T>;
	import<T = Array<any>>(id: Array<string>, importAttributes: ImportAttributes, _from: string): Promise<T>;
	import<T = any>(id: string, importAttributes: ImportAttributes, _from: string): Promise<T>;

	/**
	 * Adds a listener to an EventEmitter that will get removed if and when the file that is calling this method is reloaded.
	 */
	addTemporaryListener<Target extends EventEmitter>(target: Target, event: Parameters<Target["on"]>[0], callback: (...args: Array<any>) => any, method?: "on" | "once"): Target;

	/**
	 * Sets a Timeout that will get cancelled if and when the file that is calling this method is reloaded.
	 */
	addTemporaryTimeout(callback: () => void, ms?: number): NodeJS.Timeout;
	addTemporaryTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout;

	/**
	 * Sets an Interval that will get cancelled if and when the file that is calling this method is reloaded.
	 */
	addTemporaryInterval(callback: () => void, ms?: number): NodeJS.Timeout;
	addTemporaryInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout;

	/**
	 * Forces a file to reload if you need it to reload when not using watchFS,
	 * if the file hasn't been loaded by heatsync yet (any references to the file will not be updated),
	 * or you need it to reload faster than Node polls the filesystem if on a platform that doesn't support event based file modifications.
	 *
	 * When heatsync is already watching the file and it updates and you need it to update faster than the fs polling rate, it will cancel the fs watcher,
	 * trigger an update and then watch the file again. If the watcher has already triggered at least once, heatsync waits for the file to finish updating and then
	 * triggers the update. There is no way to stop this currently and if you call resync after this point, multiple updates will be processed.
	 */
	resync<T = any>(id: string): T;
	resync<T = any>(id: string, _from: string): T;
	resync<T = Array<any>>(id: Array<string>): T;
	resync<T = Array<any>>(id: Array<string>, _from: string): T;

	/**
	 * Stores variables heatsync should remember and be able to restore to reloaded files. Variables are scope locked to the file this function was called from.
	 * You should avoid using the same keys, especially when using tooling that bundles multiple files into one, unless you know what you're doing!
	 * If source maps are included and being loaded for the file, you can use the same keys across multiple files, but still proceed with caution!
	 *
	 * When not providing a key, we attempt to load the source file to read the variable name and use that as the key. If your source files aren't bundled or
	 * dont want us to load files from the file system (using fs.readFileSync), provide a manual key.
	 *
	 * The limitations of this system are that the key, whether provided explicitly or inferred, must not change in order to restore properly.
	 * A hard reference to the return value of the getter function first loaded is held. If the key changes, you may want to consider restarting your process.
	 */
	remember<T>(getter: () => T, key?: string): T;

	/**
	 * Marks a class as being able to update its existing instances' methods when the class updates.
	 * Class properties which are new that would be assigned from the constructor cannot be added.
	 * *The class passed into this method MUST DIRECTLY EXTEND the ReloadableClass which is provided to you on Sync instances.
	 * You cannot use the ReloadableClass provided from one Sync instance on another.
	 * The limitations of this system are that the class cannot move between files and its name cannot change. If you need to do this, restart your process.
	 * Only weak references to instances are held, so they can be garbage collected normally.
	 *
	 * *We are considering allowing deep class hierarchies to be reloadable, but are currently face engineering challenges.
	 *
	 * @example
	 * const Sync = require("heatsync");
	 * const sync = new Sync();
	 *
	 * class ThisCanReloadMethods extends sync.ReloadableClass { // works
	 * 	constructor() {
	 * 		this.hello = Math.random(); // constructor and fields won't change on existing instances
	 * 	}
	 *
	 * 	magic() {
	 * 		console.log(this.hello + " 1"); // changes to methods will be reloaded on existing instances
	 * 	}
	 * }
	 * sync.reloadClassMethods(ThisCanReloadMethods);
	 * @example
	 * class ThisCanAlsoReload extends sync.reloadClassMethods(() => ThisCanAlsoReload) { // works
	 * 	constructor() { ... }
	 * 	magic() { ... }
	 * }
	 * // doesn't need a follow-up function call
	 * @example
	 * class ThisWontWork extends ThisCanReloadMethods {} // doesn't directly extend sync.ReloadableClass. Won't work
	 * sync.reloadClassMethods(ThisWontWork); // Throws an error about not directly extending.
	 */
	reloadClassMethods(loadedClass: Class | (() => Class | any)): Class;

	/**
	 * Clean up everything related to this HeatSync instance.
	 * Removes all temporary listeners, timers, fs watchers, imported module references,
	 * hard reloadable class instance references, remembered variables and ImportAttributes.
	 */
	dispose(): void;
}

export = Sync;
