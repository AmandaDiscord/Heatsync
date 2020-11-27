import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { BackTracker } from "backtracker";

const currentYear = new Date().getFullYear();

class Reloader {
	/**
	 * The absolute path to the directory Reloader was instanciated with.
	 */
	public dirname: string;
	/**
	 * An EventEmitter which emits absolute reloaded file paths.
	 */
	public events: EventEmitter;
	/**
	 * A Map keyed by absolute file paths which details listeners added to a target.
	 */
	private _listeners: Map<string, Array<[EventEmitter, string, (...args: Array<any>) => any]>>;
	/**
	 * A Map keyes by absolute file paths which holds references to imports.
	 */
	private _references: Map<string, any>;

	public constructor(dirname = process.cwd()) {
		const from = BackTracker.stack.first;

		this.dirname = !path.isAbsolute(dirname) ? path.join(from.dir, dirname) : dirname;

		this.events = new EventEmitter()

		this._listeners = new Map();
		this._references = new Map();

		this.events.on("any", (filename: string) => {
			const listeners = this._listeners.get(filename);
			if (!listeners) return;

			for (const [target, event, func] of listeners) {
				target.removeListener(event, func);
			}
		});
	}

	public require(id: string): any;
	public require(id: Array<string>): any;
	public require(id: string, _from: string): any;
	public require(id: string | Array<string>, _from?: string): any {
		if (typeof id === "string" && !id.startsWith(".")) throw new TypeError("Reloader does not support reloading npm modules");
		const from = _from ? _from : BackTracker.stack.first.dir;
		if (Array.isArray(id)) return id.map(item => this.require(item, from))
		const directory = !path.isAbsolute(id) ? path.join(from, id) : id;
		const value = require(directory);
		if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("Required files can only export Objects in order to properly reload");

		const oldObject = this._references.get(directory);
		if (!oldObject) {
			this._references.set(directory, value);
			fs.watchFile(directory, { interval: currentYear }, () => {
				delete require.cache[directory];
				try {
					this.require(directory)
				} catch {
					this._references.delete(directory)
				}
				this.events.emit(directory)
				this.events.emit("any", directory)
			})
		}
		else {
			for (const key of Object.keys(oldObject)) {
				if (!value[key]) delete oldObject[key];
			}
			Object.assign(oldObject, value);
		}
		return value;
	}

	addTemporaryListener(target: EventEmitter, event: string, callback: (...args: Array<any>) => any, method: "on" | "once" = "on") {
		const first = BackTracker.stack.first
		const absolute = path.normalize(`${first.dir}/${first.filename}`);
		if (!this._listeners.get(absolute)) this._listeners.set(absolute, []);
		this._listeners.get(absolute)!.push([target, event, callback]);
		return target[method](event, callback);
	}
}

export = Reloader
