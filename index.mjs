// @ts-check

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { EventEmitter } from "node:events";
import assert from "node:assert";

import { getStack } from "backtracker";

import shared from "./shared.js";

const wrongLoaderError = "The ESM version of heatsync does not support the require statement. Use the require statement to import heatsync if heatsync must use the require statement in the backend";
const refreshRegex = /(\?refresh=\d+)/;

/** @param {any} item */
function objectLike(item) {
	return typeof item === "object" && item !== null && !Array.isArray(item);
}

/** @param {string} id */
function cleanPath(id) {
	id = id.replace(refreshRegex, "");
	if (id.startsWith("file://")) id = url.fileURLToPath(id);
	if (path.isAbsolute(id)) id = path.normalize(id);
	return id;
}

/** @typedef {(path: string, options: fs.WatchFileOptions & { bigint?: false }, cb: (...args: any[]) => any) => any} WatchFunction */
/** @typedef {abstract new (...args: any) => any} Class */
/**
 * @typedef SyncOptions
 * @property {boolean} [watchFS]
 * @property {boolean} [persistentWatchers]
 * @property {WatchFunction} [watchFunction]
 */

class Sync {
	/**
	 * @param {SyncOptions} [options]
	 */
	constructor(options) {
		/**
		 * @type {Required<SyncOptions>}
		 * @private
		 */
		// @ts-expect-error
		this._options = {};
		if (options?.watchFS === undefined) this._options.watchFS = true;
		else this._options.watchFS = options.watchFS ?? false;
		if (options?.persistentWatchers === undefined) this._options.persistentWatchers = true;
		else this._options.persistentWatchers = options.persistentWatchers ?? false;
		if (options?.watchFunction === undefined) this._options.watchFunction = fs.watch;
		else this._options.watchFunction = options.watchFunction ?? fs.watch;

		/** @type {EventEmitter} */
		this.events = new EventEmitter();
		/**
		 * @type {Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>}
		 * @private
		 */
		this._listeners = new Map();
		/**
		 * @type {Map<string, any>}
		 * @private
		 */
		this._references = new Map();
		/**
		 * @type {Map<string, import("fs").FSWatcher>}
		 * @private
		 */
		this._watchers = new Map();
		/**
		 * @type {Set<string>}
		 * @private
		 */
		this._needsrefresh = new Set();
		/**
		 * @type {Map<string, Array<["timeout" | "interval", NodeJS.Timeout]>>}
		 * @private
		 */
		this._timers = new Map();
		/**
		 * @type {Map<string, any>}
		 * @private
		 */
		this._remembered = new Map();
		/**
		 * @type {Map<string, Set<WeakRef<any>>>}
		 * @private
		 */
		this._reloadableInstances = new Map();
		/**
		 * @type {Map<string, ImportAttributes>}
		 * @private
		 */
		this._attributes = new Map();

		const sync = this;
		/** @type {Class} */
		this.ReloadableClass = class ReloadableClass {
			constructor() {
				const first = getStack().first();
				assert(first);
				const key = `${cleanPath(first.srcAbsolute)}:${this.constructor.name}`;
				if (!sync._reloadableInstances.has(key)) sync._reloadableInstances.set(key, new Set());
				const ref = new WeakRef(this);
				const set = sync._reloadableInstances.get(key);
				assert(set);
				set.add(ref);
				sync._reloadableInstancesRegistry.register(this, { key, ref });
			}
		}

		/**
		 * @type {FinalizationRegistry<{ key: string, ref: WeakRef<any> }>}
		 * @private
		 */
		this._reloadableInstancesRegistry = new FinalizationRegistry(({ key, ref }) => {
			const instances = this._reloadableInstances.get(key);
			if (instances) {
				instances.delete(ref);
				if (!instances.size) this._reloadableInstances.delete(key);
			}
		});
	}

	/**
	 * @template [T=any]
	 * @param {string | Array<string>} id
	 * @param {string} [_from]
	 * @returns {T}
	 */
	require(id, _from) {
		throw new Error(wrongLoaderError);
	}

	/**
	 * @template [T=any]
	 * @param {string | Array<string>} id
	 * @param {ImportAttributes} [importAttributes]
	 * @param {string} [_from]
	 * @returns {Promise<T>}
	 */
	async import(id, importAttributes, _from) {
		/** @type {string} */
		let from;
		// @ts-expect-error
		from = _from ?? getStack().first().dir;
		// @ts-expect-error
		if (Array.isArray(id)) return Promise.all(id.map(item => this.import(item, importAttributes, from)));
		const directory = Sync._resolve(cleanPath(id), cleanPath(from));
		if (this._references.get(directory) && !this._needsrefresh.has(directory)) return this._references.get(directory);
		if (directory === cleanPath(import.meta.url)) throw new Error(shared.selfReloadError);
		let value
		if (importAttributes) value = await import(`file://${directory}?refresh=${Date.now()}`, { with: importAttributes });
		else value = await import(`file://${directory}?refresh=${Date.now()}`); // this busts the internal import cache
		if (importAttributes) this._attributes.set(directory, importAttributes);
		if (!objectLike(value)) throw new Error(`${directory} ${shared.nonObjectErrorPart}`);
		this._needsrefresh.delete(directory);

		const oldObject = this._references.get(directory);
		if (oldObject) {
			for (const key of Object.keys(oldObject)) {
				if (value[key] === undefined) delete oldObject[key];
			}
			if (oldObject.default && value?.default && objectLike(oldObject.default) && objectLike(value.default)) {
				for (const key of Object.keys(oldObject.default)) {
					if (value.default[key] === undefined) delete oldObject.default[key];
				}
			}
			if (oldObject.default && value?.default && objectLike(oldObject.default) && objectLike(value.default)) {
				if (typeof value.default === "object" && !Array.isArray(value.default)) {
					for (const key of Object.keys(value.default)) {
						oldObject.default[key] = value.default[key];
					}
				}
			}

			for (const key of Object.keys(value)) {
				if (key === "default") continue;
				oldObject[key] = value[key];
				delete value[key] // Allows the old values to get garbage collected when the module is eventually imported again. Not the import itself though
			} // Don't use Object.assign because of export default being readonly and no ignore list
		} else {
			this._references.set(directory, value);

			if (this._options.watchFS) this._watchFile(directory);
		}

		return oldObject ?? value;
	}

	/**
	 * @template {EventEmitter} Target
	 * @param {Target} target
	 * @param {Parameters<Target["on"]>[0]} event
	 * @param {(...args: Array<any>) => any} callback
	 * @param {"on" | "once"} method
	 * @returns {Target}
	 */
	addTemporaryListener(target, event, callback, method = "on") {
		if (typeof target?.[method] !== "function") throw new TypeError(`${target?.constructor?.name ?? typeof target} does not include the method "${method}". It may not implement/extend or only partially implements/extends an EventEmitter`);
		let first = getStack().first();
		assert(first);
		const absolute = cleanPath(first.absolute);
		if (!this._listeners.get(absolute)) this._listeners.set(absolute, []);
		// @ts-expect-error
		this._listeners.get(absolute).push([target, event, callback]);
		setImmediate(() => target[method](event, callback));
		return target;
	}

	/**
	 * @template {any[]} TArgs
	 * @param {(...args: TArgs) => void} callback
	 * @param {number} [ms]
	 * @param {...TArgs} args
	 * @returns {NodeJS.Timeout}
	 */
	addTemporaryTimeout(callback, ms, ...args) {
		let first = getStack().first();
		assert(first);
		const absolute = cleanPath(first.absolute);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		/** @type {NodeJS.Timeout} */
		// @ts-expect-error
		const timer = setTimeout(callback, ms, ...args);
		// @ts-expect-error
		this._timers.get(absolute).push(["timeout", timer]);
		return timer;
	}

	/**
	 * @template {any[]} TArgs
	 * @param {(...args: TArgs) => void} callback
	 * @param {number} [ms]
	 * @param {...TArgs} args
	 * @returns {NodeJS.Timeout}
	 */
	addTemporaryInterval(callback, ms, ...args) {
		let first = getStack().first();
		assert(first);
		const absolute = cleanPath(first.absolute);
		if (!this._timers.get(absolute)) this._timers.set(absolute, []);
		/** @type {NodeJS.Timeout} */
		// @ts-expect-error
		const timer = setInterval(callback, ms, ...args);
		// @ts-expect-error
		this._timers.get(absolute).push(["interval", timer]);
		return timer;
	}

	/**
	 * @template [T=any]
	 * @param {string} id
	 * @param {string} [_from]
	 * @returns {Promise<T>}
	 */
	async resync(id, _from) {
		/** @type {string} */
		let from;
		// @ts-expect-error
		from = _from ?? getStack().first().dir;
		// @ts-expect-error
		if (Array.isArray(id)) return Promise.all(id.map(item => this.resync(item, from)));
		const directory = Sync._resolve(cleanPath(id), cleanPath(from));
		if (directory === cleanPath(import.meta.url)) throw new Error(shared.selfReloadError);

		this._watchers.get(directory)?.close();
		this._watchers.delete(directory);

		const result = await this._watchFunctionCallback(directory);

		if (result === shared.failedSymbol) throw new Error(shared.resyncFailError);

		if (this._options.watchFS && !this._watchers.has(directory)) this._watchFile(directory);

		return result;
	}

	/**
	 * @template T
	 * @param {() => T} getter
	 * @param {string} [key]
	 * @returns {T}
	 */
	remember(getter, key) {
		const first = getStack().first();
		assert(first);

		if (!key) {
			const content = fs.readFileSync(cleanPath(first.srcAbsolute), { encoding: "utf8" });
			const lines = content.split("\n");
			const line = lines[first.srcLine - 1];
			const variableMatches = [...line.matchAll(/([a-zA-Z0-9_$.]+) *[=:]/g)];
			// If there are multiple calls to .remember on the same line, rememberFunctionCallColumn is the column of THIS function call, but multiple variables might match the regexp.
			// The closest variable to the function call (without going past it) is the correct variable to use.
			// So we just look for the last match that's before this function call.
			const rememberFunctionCallColumn = first.srcColumn - 1;
			const lastMatch = variableMatches.findLast(match => match.index < rememberFunctionCallColumn);
			if (!lastMatch) {
				throw new Error(
					shared.parseKeyError
					+ `\n  > ${first.srcLine} | ${line}\n`
				);
			}
			key = lastMatch[1];
		}

		key = `${cleanPath(first.srcAbsolute)}:${key}`;

		if (this._remembered.has(key)) return this._remembered.get(key);

		const value = getter();
		this._remembered.set(key, value);
		return value;
	}

	/**
	 * @param {Class | (() => Class | any)} loadedClass
	 */
	reloadClassMethods(loadedClass) {
		const first = getStack().first();
		assert(first);
		const abs = cleanPath(first.srcAbsolute);

		/** @param {Class | (() => Class)} loadedClass */
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

	dispose() {
		for (const entry of this._listeners.values()) {
			for (const l of entry) l[0].removeListener(l[1], l[2]);
		}
		for (const timers of this._timers.values()) {
			for (const [type, t] of timers) (type === "timeout" ? clearTimeout : clearInterval)(t);
		}
		for (const w of this._watchers.values()) w.close();
		for (const s of this._reloadableInstances.values()) s.clear();

		this._listeners.clear();
		this._watchers.clear();
		this._timers.clear();
		this._remembered.clear();
		this._references.clear();
		this._reloadableInstances.clear();
		this._attributes.clear();
	}

	/**
	 * @param {string} directory
	 * @returns {void}
	 * @private
	 */
	_watchFile(directory) {
		/** @type {NodeJS.Timeout | null} */
		let timer = null;

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

	/**
	 * @param {string} directory
	 * @returns {Promise<any>}
	 * @private
	 */
	async _watchFunctionCallback(directory) {
		this._needsrefresh.add(directory);
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
			const attribs = this._attributes.get(directory)
			await this.import(directory, attribs)
		} catch (e) {
			// @ts-expect-error Cannot type annotate as Error. Has to be any or unknown. But cannot cleanly type annotate
			e.file = directory;
			this.events.emit("error", e);
			return shared.failedSymbol;
		}
	}

	/**
	 * @param {string} id
	 * @param {string} from
	 * @returns {string}
	 * @private
	 */
	static _resolve(id, from) {
		id = id.replace("\\", "/"); // \ causes ERR_INVALID_MODULE_SPECIFIER is not a valid package name
		if (path.isAbsolute(id)) return cleanPath(import.meta.resolve(id));
		else return id.startsWith(".") ? cleanPath(import.meta.resolve(path.join(from, id))) : cleanPath(import.meta.resolve(id));
		// else resolves either local paths (require only looks in the current dir if a ./ or ../ is present at the start otherwise it looks in registries like node_modules)
	}
}

export default Sync;
