import fs = require("fs");
import path = require("path");
import { EventEmitter } from "events";
import { getStack } from "backtracker";

const selfReloadError = "Do not attempt to re-require Heatsync. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(";
const failedSymbol = Symbol("LOADING_MODULE_FAILED");

function isObject(item: any) {
	if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
	return (item.constructor?.name === "Object");
}

/**
 * This will be fs.watch or fs.watchFile
 */
type WatchFunction = (path: string, options: fs.WatchFileOptions & { bigint?: false }, cb: (...args: any[]) => any) => any;
type Class = abstract new (...args: any) => any;

class Sync {
	/**
	 * An EventEmitter which emits absolute reloaded file paths.
	 */
	public events = new EventEmitter();
	/**
	 * A class you can extend from to allow your class's methods to be reloadable.
	 * See sync.reloadClassMethods for more info.
	 */
	public ReloadableClass: Class;

	private readonly _listeners = new Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>();
	private readonly _timers = new Map<string, Array<["timeout" | "interval", NodeJS.Timeout]>>();
	private readonly _remembered = new Map<string, any>();
	private readonly _references = new Map<string, any>();
	private readonly _watchers = new Map<string, import("fs").FSWatcher>();
	private readonly _reloadableInstances: Map<string, Set<WeakRef<any>>> = new Map();
	private readonly _reloadableInstancesRegistry: FinalizationRegistry<{ key: string, ref: WeakRef<any> }>;

	private readonly _options: { watchFS: boolean; persistentWatchers: boolean; watchFunction: WatchFunction } = {} as typeof this._options;

	public constructor(options?: { watchFS?: boolean; persistentWatchers?: boolean; watchFunction?: WatchFunction }) {
		if (options?.watchFS === undefined) this._options.watchFS = true;
		else this._options.watchFS = options.watchFS ?? false;
		if (options?.persistentWatchers === undefined) this._options.persistentWatchers = true;
		else this._options.persistentWatchers = options.persistentWatchers ?? false;
		if (options?.watchFunction === undefined) this._options.watchFunction = fs.watch;
		else this._options.watchFunction = options.watchFunction;

		const sync = this;
		this.ReloadableClass = class ReloadableClass {
			constructor() {
				const first = getStack().first()!;
				const key = `${first.srcAbsolute}:${this.constructor.name}`;
				if (!sync._reloadableInstances.has(key)) sync._reloadableInstances.set(key, new Set());
				const ref = new WeakRef(this);
				sync._reloadableInstances.get(key)!.add(ref);
				sync._reloadableInstancesRegistry.register(this, { key, ref });
			}
		}

		this._reloadableInstancesRegistry = new FinalizationRegistry(({ key, ref }) => this._reloadableInstances.get(key)?.delete(ref));
	}

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
	public require(id: string): any;
	public require(id: Array<string>): any;
	public require(id: string, _from: string): any;
	public require(id: string | Array<string>, _from?: string): any {
		let from: string;
		from = _from ?? getStack().first()!.dir;
		if (Array.isArray(id)) return id.map(item => this.require(item, from));
		const directory = !path.isAbsolute(id) ? require.resolve(path.join(from, id)) : require.resolve(id);
		if (directory === __filename) throw new Error(selfReloadError);
		const value = require(directory);
		if (!isObject(value)) throw new Error(`${directory} does not export an Object and as such, changes made to the file cannot be reflected as the value would be immutable. Importing through HeatSync isn't supported and may be erraneous`);

		const oldObject = this._references.get(directory);
		if (!oldObject) {
			this._references.set(directory, value);

			if (this._options.watchFS) this._watchFile(directory)
		} else {
			for (const key of Object.keys(oldObject)) {
				if (value[key] === undefined) delete oldObject[key];
			}
			Object.assign(oldObject, value);
		}

		const ref = this._references.get(directory);
		if (!ref) return value;
		else return ref;
	}

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
	public import(id: string): Promise<ImportedModule>;
	public import(id: Array<string>): Promise<Array<ImportedModule>>;
	public import(id: Array<string>, _from: string): Promise<Array<ImportedModule>>;
	public import(id: string, _from: string): Promise<ImportedModule>;
	public import(_id: string | Array<string>, _from?: string): Promise<ImportedModule | Array<ImportedModule>> {
		throw new Error("The CJS version of heatsync does not support the import statement. Use the import statement to import heatsync if heatsync must use the import statement in the backend");
	}

	/**
	 * Adds a listener to an EventEmitter that will get removed if and when the file that is calling this method is reloaded.
	 */
	public addTemporaryListener<Target extends EventEmitter>(target: Target, event: Parameters<Target["on"]>[0], callback: (...args: Array<any>) => any, method: "on" | "once" = "on") {
		if (typeof target?.[method] !== "function") throw new TypeError(`${target?.constructor?.name ?? typeof target} does not include the method "${method}". It may not implement/extend or only partially implements/extends an EventEmitter`);
		const first = getStack().first()!;
		const absolute = path.normalize(first.absolute);
		if (!this._listeners.get(absolute)) this._listeners.set(absolute, []);
		this._listeners.get(absolute)!.push([target, event as string, callback]);
		setImmediate(() => target[method](event, callback));
		return target;
	}

	/**
	 * Sets a Timeout that will get cancelled if and when the file that is calling this method is reloaded.
	 */
	public addTemporaryTimeout(callback: () => void, ms?: number): NodeJS.Timeout;
	public addTemporaryTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout
	public addTemporaryTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout {
		const first = getStack().first()!;
		const absolute = path.normalize(first.absolute);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		const timer = setTimeout<TArgs>(callback, ms, ...args);
		this._timers.get(absolute)!.push(["timeout", timer]);
		return timer;
	}

	/**
	 * Sets an Interval that will get cancelled if and when the file that is calling this method is reloaded.
	 */
	public addTemporaryInterval(callback: () => void, ms?: number): NodeJS.Timeout;
	public addTemporaryInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout
	public addTemporaryInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout {
		const first = getStack().first()!;
		const absolute = path.normalize(first.absolute);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		const timer = setInterval<TArgs>(callback, ms, ...args);
		this._timers.get(absolute)!.push(["interval", timer]);
		return timer;
	}

	/**
	 * Forces a file to reload if you need it to reload when not using watchFS, if the file hasn't been loaded by heatsync,
	 * or you need it to reload faster than Node polls the filesystem if on a platform that doesn't support event based file modifications.
	 *
	 * When heatsync is already watching the file and it updates and you need it to update faster than the fs polling rate, it will cancel the fs watcher,
	 * trigger an update and then watch the file again. If the watcher has already triggered at least once, heatsync waits for the file to finish updating and then
	 * triggers the update. There is no way to stop this currently and if you call resync after this point, multiple updates will be processed.
	 */
	public resync(id: string): any;
	public resync(id: Array<string>): any;
	public resync(id: string, _from?: string): any;
	public resync(id: string, _from?: string): any;
	public resync(id: string | Array<string>, _from?: string): any {
		let from: string;
		if (typeof id === "string" && !id.startsWith(".")) from = require.resolve(id);
		else from = _from ?? getStack().first()!.dir;
		if (Array.isArray(id)) return id.map(item => this.resync(item, from));
		const directory = !path.isAbsolute(id) ? require.resolve(path.join(from, id)) : require.resolve(id);
		if (directory === __filename) throw new Error(selfReloadError);

		this._watchers.get(directory)?.close(); // close it in case the intent was to reload the file faster than an existing watcher that was active if it was polling.
		this._watchers.delete(directory);

		const result = this._watchFunctionCallback(directory);

		if (result === failedSymbol) throw new Error("Module failed to resync");

		if (this._options.watchFS && !this._watchers.has(directory)) this._watchFile(directory);

		return result;
	}

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
	public remember<T>(getter: () => T, key?: string): T {
		const first = getStack().first()!;

		if (!key) {
			const path = first.srcAbsolute;
			const content = fs.readFileSync(path, { encoding: "utf8" });
			const lines = content.split("\n");
			const line = lines[first.srcLine - 1];
			let variableMatches = [...line.matchAll(/([a-zA-Z0-9_$.]+) *[=:]/g)];
			// This will match the following: const a: string = sync.remember(() => "a")
			// Like so:                             0^ 1^^^^^^^
			// So it matches types as well as variable names if we're in TypeScript world. Can't fix this with regex. Need to trim it with code.
			variableMatches = variableMatches.filter(match => line[match.index - 2] !== ":");
			// If there are multiple calls to .remember on the same line, rememberFunctionCallColumn is the column of THIS function call, but multiple variables might match the regexp.
			// The closest variable to the function call (without going past it) is the correct variable to use.
			// So we just look for the last match that's before this function call.
			const rememberFunctionCallColumn = first.srcColumn - 1;
			const lastMatch = variableMatches.filter(match => match.index < rememberFunctionCallColumn).slice(-1)[0];
			if (!lastMatch) {
				throw new Error(
					`Sorry, couldn't parse out the variable name from the line where you used sync.remember. Please provide a key as the second argument instead!`
					+ `\n  > ${first.srcLine} | ${line}\n`
				);
			}
			key = lastMatch[1];
		}

		key = `${first.srcAbsolute}:${key}`;

		if (this._remembered.has(key)) return this._remembered.get(key);

		const value = getter();
		this._remembered.set(key, value);
		return value;
	}

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
	 *    magic() { ... }
	 * }
	 * // doesn't need a follow-up function call
	 * @example
	 * class ThisWontWork extends ThisCanReloadMethods {} // doesn't directly extend sync.ReloadableClass. Won't work
	 * sync.reloadClassMethods(ThisWontWork); // Throws an error about not directly extending.
	 */
	public reloadClassMethods(loadedClass: Class | (() => Class | any)): Class {
		const first = getStack().first()!;
		const abs = first.srcAbsolute;

		const loadClass = loadedClass => {
			const key = `${abs}:${loadedClass.name}`;

			if (Object.getPrototypeOf(loadedClass) !== this.ReloadableClass) throw new Error(`You tried to reload class ${key}, but it needs to \`extend sync.ReloadableClass\` (directly) for that to work.`);

			for (const ref of this._reloadableInstances.get(key) ?? []) {
				const object = ref.deref();
				if (!object) continue;
				Object.setPrototypeOf(object, loadedClass.prototype);
			}
		}

		if ("prototype" in loadedClass) loadClass(loadedClass); // passed a class - load it
		// @ts-expect-error
		else setImmediate(() => loadClass(loadedClass())); // passed a function - need to wait before we call it so that the reference is resolvable

		return this.ReloadableClass;
	}


	private _watchFile(directory: string): void {
		let timer: NodeJS.Timeout | null = null;

		this._watchers.set(
			directory,
			this._options.watchFunction(directory, { persistent: this._options.persistentWatchers }, () => {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}

				timer = setTimeout(() => this._watchFunctionCallback(directory), 1000).unref();
			})
		);
	}

	private _watchFunctionCallback(directory: string): any {
		delete require.cache[directory];
		this.events.emit(directory);
		this.events.emit("any", directory);

		const listeners = this._listeners.get(directory);
		if (listeners) {
			for (const [target, event, func] of listeners) {
				target.removeListener(event, func);
			}
		}

		const timers = this._timers.get(directory);
		if (timers) {
			for (const [type, timer] of timers) {
				if (type === "timeout") clearTimeout(timer);
				else clearInterval(timer);
			}
		}

		try {
			this.require(directory);
		} catch (e) {
			this.events.emit("error", e);
			return failedSymbol;
		}
	}
}

interface ImportedModule {
	default: any;
	[key: string | number | symbol]: any;
}

export = Sync;
