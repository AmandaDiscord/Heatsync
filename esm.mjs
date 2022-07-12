import fs from "fs";
import path from "path";
import url from "url";
import { EventEmitter } from "events";
import { BackTracker } from "backtracker";

const placeHolderKey = "__heatsync_default__";
const refreshRegex = /(\?refresh=\d+)/;

class Sync {
	constructor() {
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

		this.events.on("any", filename => {
			const normalized = path.normalize(filename);
			const listeners = this._listeners.get(normalized);
			if (!listeners) return;

			for (const [target, event, func] of listeners) {
				target.removeListener(event, func);
			}
		});
	}

	require() {
		throw new Error("The ESM version of this module does not support the require statement");
	}

	/**
	 * @param {string} id
	 * @param {string} [_from]
	 */
	async import(id, _from) {
		/** @type {string} */
		let from;
		from = _from ? _from : BackTracker.stack.first().dir;
		if (from.startsWith("file://")) from = url.fileURLToPath(from);
		from = path.normalize(from);
		if (Array.isArray(id)) return Promise.all(id.map(item => this.import(item, from)));
		let directory = (!path.isAbsolute(id) ? await Sync._resolve(path.join(from, id)) : await Sync._resolve(id));
		if (directory.startsWith("file://")) directory = url.fileURLToPath(directory);
		directory = path.normalize(directory);
		if (this._references.get(directory) && !this._needsrefresh.has(directory)) {
			const re = this._references.get(directory);
			return re[placeHolderKey] ? re[placeHolderKey] : re;
		}
		const req = await import(`file://${directory}?refresh=${Date.now()}`); // this busts the internal import cache
		this._needsrefresh.delete(directory);
		let value;
		if (typeof req !== "object" || Array.isArray(req)) {
			value = {};
			Object.defineProperty(value, placeHolderKey, { value: req });
		} else value = req;

		const oldObject = this._references.get(directory);
		if (!oldObject) {
			this._references.set(directory, value);
			let timer = null;
			this._watchers.set(directory, fs.watch(directory, () => {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				timer = setTimeout(async () => {
					this._needsrefresh.add(directory);
					this.events.emit(directory);
					this.events.emit("any", directory);
					try {
						await this.import(directory);
					} catch (e) {
						return this.events.emit("error", e);
					}
				}, 1000); // Only emit and re-require once all changes have finished
			}));
		} else {
			for (const key of Object.keys(oldObject)) {
				if (key === placeHolderKey || key === "default") continue;
				if (!value[key]) delete oldObject[key];
			}
			if (oldObject.default && value && value.default) {
				for (const key of Object.keys(oldObject.default)) {
					if (!value.default[key]) delete oldObject.default[key];
				}
			}
			if (oldObject.default && value && value.default) {
				if (typeof value.default === "object" && !Array.isArray(value.default)) {
					for (const key of Object.keys(value.default)) {
						oldObject.default[key] = value.default[key];
					}
				}
			}
			for (const key of Object.keys(value)) {
				if (key === "default") continue;
				oldObject[key] = value[key];
			} // Don't use Object.assign because of export default being readonly and no ignore list
		}

		const ref = this._references.get(directory);
		if (!ref) return req;
		else return ref[placeHolderKey] ? ref[placeHolderKey] : ref;
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
		let first = BackTracker.stack.first().path.replace(refreshRegex, "");
		if (first.startsWith("file://")) first = url.fileURLToPath(first);
		first = path.normalize(first);
		if (!this._listeners.get(first)) this._listeners.set(first, []);
		// @ts-ignore
		this._listeners.get(first).push([target, event, callback]);
		setImmediate(() => target[method](event, callback));
		return target;
	}

	/**
	 * @param {string} id
	 * @returns {Promise<string>}
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

	/**
	 * @param {string} id
	 * @param {string} [_from]
	 * @returns {Promise<any>}
	 */
	async resync(id, _from) {
		/** @type {string} */
		let from;
		if (typeof id === "string" && !id.startsWith(".")) from = await Sync._resolve(id);
		else from = _from ? _from : BackTracker.stack.first().dir;
		if (from.startsWith("file://")) from = url.fileURLToPath(from);
		from = path.normalize(from);
		if (Array.isArray(id)) return Promise.all(id.map(item => this.resync(item, from)));
		let directory = (!path.isAbsolute(id) ? await Sync._resolve(path.join(from, id)) : await Sync._resolve(id));
		if (directory.startsWith("file://")) directory = url.fileURLToPath(directory);
		directory = path.normalize(directory);
		this._needsrefresh.add(directory);
		return this.import(directory);
	}
}

export default Sync;