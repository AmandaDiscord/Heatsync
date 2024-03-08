import fs = require("fs");
import path = require("path");
import { EventEmitter } from "events";
import { getStack } from "backtracker";

const selfReloadError = "Do not attempt to re-require Heatsync. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(";

function isObject(item: any) {
	if (typeof item !== "object" || item === null || Array.isArray(item)) return false
	return (item.constructor?.name === "Object");
}

class Sync {
	/**
	 * An EventEmitter which emits absolute reloaded file paths.
	 */
	public events = new EventEmitter();
	/**
	 * A Map keyed by absolute file paths which details listeners added to a target.
	 */
	private _listeners = new Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>();
	private _timers = new Map<string, Array<["timeout" | "interval", NodeJS.Timeout]>>();
	/**
	 * A Map keyed by absolute file paths which holds references to imports.
	 */
	private _references = new Map<string, any>();
	/**
	 * A Map keyed by absolute file paths which are being watched by heatsync.
	 */
	private _watchers = new Map<string, import("fs").FSWatcher>();
	private _options: { watchFS: boolean; persistentWatchers: boolean; }

	public constructor(options?: { watchFS?: boolean; persistentWatchers?: boolean; }) {
		this._options = {} as { watchFS: boolean; persistentWatchers: boolean; };
		if (options?.watchFS === undefined) this._options.watchFS = true;
		else this._options.watchFS = options.watchFS ?? false;
		if (options?.persistentWatchers === undefined) this._options.persistentWatchers = true;
		else this._options.persistentWatchers = options.persistentWatchers ?? false;
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
			if (this._options.watchFS) {
				let timer: NodeJS.Timeout | null = null;
				this._watchers.set(directory, fs.watch(directory, { persistent: this._options.persistentWatchers }, () => {
					if (timer) {
						clearTimeout(timer);
						timer = null;
					}
					timer = setTimeout(() => {
						delete require.cache[directory];
						try {
							this.require(directory);
						} catch (e) {
							return this.events.emit("error", e);
						}
						this.events.emit(directory);
						this.events.emit("any", directory);
						const listeners = this._listeners.get(directory);
						if (listeners) {
							for (const [target, event, func] of listeners) {
								target.removeListener(event, func);
							}
						}
						const timers = this._timers.get(directory)
						if (timers) {
							for (const [type, timer] of timers) {
								if (type === "timeout") clearTimeout(timer)
								else clearInterval(timer)
							}
						}
					}, 1000).unref(); // Only emit and re-require once all changes have finished
				}));
			}
		} else {
			for (const key of Object.keys(oldObject)) {
				if (!value[key]) delete oldObject[key];
			}
			Object.assign(oldObject, value);
		}

		const ref = this._references.get(directory);
		if (!ref) return value;
		else return ref;
	}

	public import(id: string): Promise<ImportedModule>;
	public import(id: Array<string>): Promise<Array<ImportedModule>>;
	public import(id: Array<string>, _from: string): Promise<Array<ImportedModule>>;
	public import(id: string, _from: string): Promise<ImportedModule>;
	public import(_id: string | Array<string>, _from?: string): Promise<ImportedModule | Array<ImportedModule>> {
		throw new Error("The CJS version of this module does not support the import statement");
	}

	public addTemporaryListener<Target extends EventEmitter>(target: Target, event: Parameters<Target["on"]>[0], callback: (...args: Array<any>) => any, method: "on" | "once" = "on") {
		const first = getStack().first()!;
		const absolute = path.normalize(first.absolute);
		if (!this._listeners.get(absolute)) this._listeners.set(absolute, []);
		this._listeners.get(absolute)!.push([target, event as string, callback]);
		setImmediate(() => target[method](event, callback));
		return target;
	}

	public addTemporaryTimeout(callback: () => void, ms?: number): NodeJS.Timeout;
	public addTemporaryTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout
	public addTemporaryTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout {
		const first = getStack().first()!;
		const absolute = path.normalize(`${first.dir}/${first.absolute}`);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		const timer = setTimeout<TArgs>(callback, ms, ...args);
		this._timers.get(absolute)!.push(["timeout", timer]);
		return timer;
	}

	public addTemporaryInterval(callback: () => void, ms?: number): NodeJS.Timeout;
	public addTemporaryInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout
	public addTemporaryInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms?: number, ...args: TArgs): NodeJS.Timeout {
		const first = getStack().first()!;
		const absolute = path.normalize(`${first.dir}/${first.absolute}`);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		const timer = setInterval<TArgs>(callback, ms, ...args);
		this._timers.get(absolute)!.push(["interval", timer]);
		return timer;
	}

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
		delete require.cache[directory];
		return this.require(directory);
	}
}

interface ImportedModule {
	default: any;
	[key: string | number | symbol]: any;
}

export = Sync;
