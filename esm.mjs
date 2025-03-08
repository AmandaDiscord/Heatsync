// @ts-check

import fs from "fs";
import path from "path";
import url from "url";
import { EventEmitter } from "events";
import { getStack } from "backtracker";
import assert from "assert";

const selfReloadError = "Do not attempt to re-require Heatsync. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(";
const refreshRegex = /(\?refresh=\d+)/;
const failedSymbol = Symbol("LOADING_MODULE_FAILED");

/** @param {any} item */
function isObject(item) {
	if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
	return (item.constructor?.name === "Object");
}

/** @typedef {(path: string, options: fs.WatchFileOptions & { bigint?: false }, cb: (...args: any[]) => any) => any} WatchFunction */
/** @typedef {abstract new (...args: any) => any} Class */

class Sync {
	/**
	 * @param {{ watchFS?: boolean; persistentWatchers?: boolean; watchFunction?: WatchFunction }} [options]
	 */
	constructor(options) {
		/** @type {{ watchFS: boolean; persistentWatchers: boolean; watchFunction: WatchFunction }} */
		// @ts-expect-error
		this._options = {};
		if (options?.watchFS === undefined) this._options.watchFS = true;
		else this._options.watchFS = options.watchFS ?? false;
		if (options?.persistentWatchers === undefined) this._options.persistentWatchers = true;
		else this._options.persistentWatchers = options.persistentWatchers ?? false;
		if (options?.watchFunction === undefined) this._options.watchFunction = fs.watch;
		else this._options.watchFunction = options.watchFunction ?? fs.watch;

		this.events = new EventEmitter();
		/**
		 * @type {Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>}
		 */
		this._listeners = new Map();
		/**
		 * @type {Map<string, any>}
		 */
		this._references = new Map();
		/**
		 * @type {Map<string, import("fs").FSWatcher>}
		 */
		this._watchers = new Map();
		/** @type {Set<string>} */
		this._needsrefresh = new Set();
		/** @type {Map<string, Array<["timeout" | "interval", NodeJS.Timeout]>>} */
		this._timers = new Map();
		/** @type {Map<string, any>} */
		this._remembered = new Map();
		/** @type {Map<string, Set<WeakRef<any>>>} */
		this._reloadableInstances = new Map();
		/** @type {Map<string, ImportAttributes>} */
		this._attributes = new Map()

		const sync = this;
		this.ReloadableClass = class ReloadableClass {
			constructor() {
				const first = getStack().first();
				assert(first);
				const key = `${first.srcAbsolute}:${this.constructor.name}`;
				if (!sync._reloadableInstances.has(key)) sync._reloadableInstances.set(key, new Set());
				const ref = new WeakRef(this);
				const set = sync._reloadableInstances.get(key);
				assert(set);
				set.add(ref);
				sync._reloadableInstancesRegistry.register(this, { key, ref });
			}
		}

		this._reloadableInstancesRegistry = new FinalizationRegistry(({ key, ref }) => this._reloadableInstances.get(key)?.delete(ref));
	}

	/**
	 * @param {string | Array<string>} id
	 * @param {string} [_from]
	 * @returns {any}
	 */
	require(id, _from) {
		throw new Error("The ESM version of heatsync does not support the require statement. Use import instead.");
	}

	/**
	 * @param {string | Array<string>} id
	 * @param {ImportAttributes} [importAttributes]
	 * @param {string} [_from]
	 * @returns {Promise<any>}
	 */
	async import(id, importAttributes, _from) {
		/** @type {string} */
		let from;
		// @ts-expect-error
		from = _from ?? getStack().first().dir;
		if (from.startsWith("file://")) from = url.fileURLToPath(from);
		from = path.normalize(from);
		if (Array.isArray(id)) return Promise.all(id.map(item => this.import(item, importAttributes, from)));
		let directory = (!path.isAbsolute(id) ? await Sync._resolve(path.join(from, id)) : await Sync._resolve(id));
		if (directory.startsWith("file://")) directory = url.fileURLToPath(directory);
		directory = path.normalize(directory);
		if (this._references.get(directory) && !this._needsrefresh.has(directory)) return this._references.get(directory);
		if (directory === path.normalize(import.meta.url.startsWith("file://") ? url.fileURLToPath(import.meta.url) : import.meta.url)) throw new Error(selfReloadError);
		let value
		if (importAttributes) value = await import(`file://${directory}?refresh=${Date.now()}`, { with: importAttributes });
		else value = await import(`file://${directory}?refresh=${Date.now()}`); // this busts the internal import cache
		if (importAttributes) this._attributes.set(directory, importAttributes);
		if (!isObject(value)) throw new Error(`${directory} does not seem to export an Object and as such, changes made to the file cannot be reflected as the value would be immutable. Importing through HeatSync isn't supported and may be erraneous. Should the export be an Object made through Object.create, make sure that you reference the export.constructor as the Object.constructor as HeatSync checks constuctor names. Exports being Classes will not reload properly`);
		this._needsrefresh.delete(directory);

		const oldObject = this._references.get(directory);
		if (!oldObject) {
			this._references.set(directory, value);

			if (this._options.watchFS) this._watchFile(directory);
		} else {
			for (const key of Object.keys(oldObject)) {
				if (value[key] === undefined) delete oldObject[key];
			}
			if (oldObject.default && value && value.default && isObject(oldObject.default) && isObject(value.default)) {
				for (const key of Object.keys(oldObject.default)) {
					if (value.default[key] === undefined) delete oldObject.default[key];
				}
			}
			if (oldObject.default && value && value.default && isObject(oldObject.default) && isObject(value.default)) {
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
		// @ts-expect-error It's always there, trust!
		let first = getStack().first().absolute.replace(refreshRegex, "");
		if (first.startsWith("file://")) first = url.fileURLToPath(first);
		first = path.normalize(first);
		if (!this._listeners.get(first)) this._listeners.set(first, []);
		// @ts-expect-error On thread race conditions???
		this._listeners.get(first).push([target, event, callback]);
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
		// @ts-expect-error
		let first = getStack().first().absolute.replace(refreshRegex, "");
		if (first.startsWith("file://")) first = url.fileURLToPath(first);
		first = path.normalize(first);
		if (!this._timers.get(first)) this._timers.set(first, []);
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
		// @ts-expect-error
		let first = getStack().first().absolute.replace(refreshRegex, "");
		if (first.startsWith("file://")) first = url.fileURLToPath(first);
		first = path.normalize(first);
		if (!this._timers.get(first)) this._timers.set(first, []);
		/** @type {NodeJS.Timeout} */
		// @ts-expect-error
		const timer = setInterval(callback, ms, ...args);
		// @ts-expect-error
		this._timers.get(absolute).push(["interval", timer]);
		return timer;
	}

	/**
	 * @param {string} id
	 * @param {string} [_from]
	 * @returns {Promise<any>}
	 */
	async resync(id, _from) {
		/** @type {string} */
		let from;
		if (typeof id === "string" && !id.startsWith(".")) from = await Sync._resolve(id);
		// @ts-expect-error
		else from = _from ?? getStack().first().dir;
		if (from.startsWith("file://")) from = url.fileURLToPath(from);
		from = path.normalize(from);
		if (Array.isArray(id)) return Promise.all(id.map(item => this.resync(item, from)));
		let directory = (!path.isAbsolute(id) ? await Sync._resolve(path.join(from, id)) : await Sync._resolve(id));
		if (directory.startsWith("file://")) directory = url.fileURLToPath(directory);
		directory = path.normalize(directory);

		this._watchers.get(directory)?.close();
		this._watchers.delete(directory);

		const result = await this._watchFunctionCallback(directory);

		if (result === failedSymbol) throw new Error("Module failed to resync");

		if (this._options.watchFS && !this._watchers.has(directory)) this._watchFile(directory);

		return result;
	}

	/**
	 * @template T
	 * @param {() => T} getter
	 * @param {string} [key]
	 * @returns {Promise<T>}
	 */
	async remember(getter, key) {
		const first = getStack().first();
		assert(first);
		let firstSrc = first.srcAbsolute.replace(refreshRegex, "");
		if (firstSrc.startsWith("file://")) firstSrc = url.fileURLToPath(firstSrc);
		firstSrc = path.normalize(firstSrc);

		if (!key) {
			const content = fs.readFileSync(firstSrc, { encoding: "utf8" });
			const lines = content.split("\n");
			const line = lines[first.srcLine - 1];
			const variableMatches = [...line.matchAll(/([a-zA-Z0-9_$.]+) *[=:]/g)];
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

		key = `${firstSrc}:${key}`;

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
		const normalized = path.normalize(directory);

		const listeners = this._listeners.get(normalized);
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
			this.events.emit("error", e);
			return failedSymbol;
		}
	}

	/**
	 * @param {string} id
	 * @returns {Promise<string>}
	 * @private
	 */
	static async _resolve(id) {
		let absolute = path.normalize(id.startsWith("file://") ? url.fileURLToPath(id) : id);
		const decon = path.parse(absolute);
		if (!decon.ext || decon.ext.length === 0) {
			// check if the id is a directory
			const isDir = await fs.promises.stat(absolute).then(s => s.isDirectory()).catch(() => false);
			if (isDir) {
				const dirContents = await fs.promises.readdir(absolute);
				if (dirContents.includes("index.mjs")) absolute = path.join(absolute, "index.mjs");
				else absolute = path.join(absolute, "index.js");
				// Even if it doesn't exist in the directory, the user still needs to know the intent of the resolver
			} else {
				// read the base dir
				const dirContents = await fs.promises.readdir(decon.dir);
				if (dirContents.includes(`${decon.name}.mjs`)) absolute = path.join(absolute, `${decon.name}.mjs`);
				else absolute = path.join(absolute, `${decon.name}.js`);
			}
		}
		await fs.promises.access(absolute, fs.constants.R_OK);
		return absolute;
	}
}

export default Sync;
