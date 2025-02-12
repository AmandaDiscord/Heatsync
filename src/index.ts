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
	public ReloadableClass: Class;

	private readonly _listeners = new Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>();
	private readonly _timers = new Map<string, Array<["timeout" | "interval", NodeJS.Timeout]>>();
	private readonly _remembered = new Map<string, any>();
	private readonly _references = new Map<string, any>();
	private readonly _watchers = new Map<string, import("fs").FSWatcher>();
	private readonly _reloadableInstances: Map<string, Set<WeakRef<any>>> = new Map();
	private readonly _reloadableInstancesRegistry: FinalizationRegistry<{key: string, ref: WeakRef<any>}>;

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
				sync._reloadableInstancesRegistry.register(this, {key, ref});
			}
		}

		this._reloadableInstancesRegistry = new FinalizationRegistry(({key, ref}) => this._reloadableInstances.get(key)?.delete(ref));
	}

	/**
	 * The return value is any, because TypeScript doesn't like dynamically typed return values for import.
	 * It expects a string literal. Cannot be a Generic extending "" either.
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
	 * The return value is any, because TypeScript doesn't like dynamically typed return values for import.
	 * It expects a string literal. Cannot be a Generic extending "" either.
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
	 * Forces a file to reload if you need it to reload when not using watchFS, if the file hasn't been loaded by heatsync, or you need it to reload faster than Node polls the filesystem if on a platform that doesn't support event based file modifications.
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
	 */
	public remember<T>(getter: () => T, key?: string): T {
		const first = getStack().first()!;

		if (!key) {
			const path = first.srcAbsolute;
			const content = fs.readFileSync(path, {encoding: "utf8"});
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

	public reloadClassMethods(loadedClass: Class): void {
		const first = getStack().first()!;
		const key = `${first.srcAbsolute}:${loadedClass.name}`;

		if (Object.getPrototypeOf(loadedClass) !== this.ReloadableClass) throw new Error(`You tried to reload class ${key}, but it needs to \`extend sync.ReloadableClass\` (directly) for that to work.`);

		if (!this._reloadableInstances.has(key)) return;

		const refs = this._reloadableInstances.get(key)!;
		for (const ref of refs) {
			const object = ref.deref();
			if (!object) continue;
			Object.setPrototypeOf(object, loadedClass.prototype);
		}
	}
}

interface ImportedModule {
	default: any;
	[key: string | number | symbol]: any;
}

export = Sync;
