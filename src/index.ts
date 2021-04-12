import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { BackTracker } from "backtracker";

const currentYear = new Date().getFullYear();

const placeHolderKey = "__reloader_default__";
const selfReloadError = "Do not attempt to re-require Reloader. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(";

class Reloader {
	/**
	 * An EventEmitter which emits absolute reloaded file paths.
	 */
	public events: EventEmitter = new EventEmitter();
	/**
	 * A Map keyed by absolute file paths which details listeners added to a target.
	 */
	private _listeners: Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>> = new Map();
	/**
	 * A Map keyed by absolute file paths which holds references to imports.
	 */
	private _references: Map<string, any> = new Map();
	/**
	 * A Map keyed by absolute file paths which are being watched by reloader.
	 */
	private _watchers: Map<string, import("./HiddenTypes")>;

	private _npmMods: Array<string> = [];

	public constructor() {
		this.events.on("any", (filename: string) => {
			const listeners = this._listeners.get(filename);
			if (!listeners) return;

			for (const [target, event, func] of listeners) {
				target.removeListener(event, func);
			}
		});
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
		if (typeof id === "string" && !id.startsWith(".") && (!path.isAbsolute(id) || id.includes("node_modules"))) {
			from = require.resolve(id);
			this._npmMods.push(from);
		} else from = _from ? _from : BackTracker.stack.first.dir;
		if (Array.isArray(id)) return id.map(item => this.require(item, from));
		const directory = !path.isAbsolute(id) ? require.resolve(path.join(from, id)) : require.resolve(id);
		if (directory === __filename) throw new Error(selfReloadError);
		const req = require(directory);
		let value: any;
		if (typeof req !== "object" || Array.isArray(req)) {
			value = {};
			Object.defineProperty(value, placeHolderKey, { value: req })
		} else value = req;

		// after requiring the npm module, all of it's children *should* be required unless they're supposed to be loaded asynchronously
		// We should watch for children changes, then resync the entry point the user required.
		if (this._npmMods.includes(directory)) {
			watch(directory);
			// Hold reference for this._watchers to use in fn.
			const instance = this;

			function watch(d: string) {
				const m = require.cache[d];
				if (!m) return;
				for (const child of m.children) {
					watch(child.filename);
					// main module will get watched by main require.
					instance._watchers.set(child.filename, fs.watchFile(child.filename, { interval: currentYear }, () => {
						instance.resync(directory);
						fs.unwatchFile(child.filename);
						instance._watchers.delete(child.filename);
					}) as unknown as import("./HiddenTypes"));
				}
			}
		}

		const oldObject = this._references.get(directory);
		if (!oldObject) {
			this._references.set(directory, value);
			this._watchers.set(directory, fs.watchFile(directory, { interval: currentYear }, () => {
				if (this._npmMods.includes(directory)) return this.resync(directory);
				delete require.cache[directory];
				try {
					this.require(directory);
				} catch {
					this._references.delete(directory);
					this._listeners.delete(directory);
					fs.unwatchFile(directory);
					this._watchers.delete(directory);
				}
				this.events.emit(directory);
				this.events.emit("any", directory);
			}) as unknown as import("./HiddenTypes"));
		} else {
			for (const key of Object.keys(oldObject)) {
				if (key === placeHolderKey) continue
				if (!value[key]) delete oldObject[key];
			}
			Object.assign(oldObject, value);
		}

		const ref = this._references.get(directory);
		if (!ref) return {}
		else return ref[placeHolderKey] ? ref[placeHolderKey] : ref
	}

	public addTemporaryListener(target: EventEmitter, event: string, callback: (...args: Array<any>) => any, method: "on" | "once" = "on") {
		const first = BackTracker.stack.first;
		const absolute = path.normalize(`${first.dir}/${first.filename}`);
		if (!this._listeners.get(absolute)) this._listeners.set(absolute, []);
		this._listeners.get(absolute)!.push([target, event, callback]);
		return target[method](event, callback);
	}

	public resync(id: string): any;
	public resync(id: Array<string>): any;
	public resync(id: string, _from?: string): any;
	public resync(id: string, _from?: string, _child?: boolean): any;
	public resync(id: string | Array<string>, _from?: string, _child?: boolean): any {
		let from: string;
		if (typeof id === "string" && !id.startsWith(".")) from = require.resolve(id);
		else from = _from ? _from : BackTracker.stack.first.dir;
		if (Array.isArray(id)) return id.map(item => this.resync(item, from));
		const directory = !path.isAbsolute(id) ? require.resolve(path.join(from, id)) : require.resolve(id);
		if (directory === __filename) throw new Error(selfReloadError);

		const mod = require.cache[directory];
		if (mod) {
			// Drop all of the children (don't take that out of context) and re-require the parent.
			// The parent will re-require all of the children it depends on and rebuild require.cache.
			for (const child of mod.children) {
				this.resync(child.filename, undefined, true);
			}
		}

		delete require.cache[directory];

		if (!_child) return this.require(directory);
		else return void 0;
	}
}

export = Reloader;
