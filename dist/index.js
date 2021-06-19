"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const backtracker_1 = require("backtracker");
const currentYear = new Date().getFullYear();
const placeHolderKey = "__heatsync_default__";
const selfReloadError = "Do not attempt to re-require Heatsync. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(";
class Sync {
    constructor() {
        /**
         * An EventEmitter which emits absolute reloaded file paths.
         */
        this.events = new events_1.EventEmitter();
        /**
         * A Map keyed by absolute file paths which details listeners added to a target.
         */
        this._listeners = new Map();
        /**
         * A Map keyed by absolute file paths which holds references to imports.
         */
        this._references = new Map();
        /**
         * A Map keyed by absolute file paths which are being watched by heatsync.
         */
        this._watchers = new Map();
        this.events.on("any", (filename) => {
            const listeners = this._listeners.get(filename);
            if (!listeners)
                return;
            for (const [target, event, func] of listeners) {
                target.removeListener(event, func);
            }
        });
    }
    require(id, _from) {
        let from;
        from = _from ? _from : backtracker_1.BackTracker.stack.first().dir;
        if (Array.isArray(id))
            return id.map(item => this.require(item, from));
        const directory = !path_1.default.isAbsolute(id) ? require.resolve(path_1.default.join(from, id)) : require.resolve(id);
        if (directory === __filename)
            throw new Error(selfReloadError);
        const req = require(directory);
        let value;
        if (typeof req !== "object" || Array.isArray(req)) {
            value = {};
            Object.defineProperty(value, placeHolderKey, { value: req });
        }
        else
            value = req;
        const oldObject = this._references.get(directory);
        if (!oldObject) {
            this._references.set(directory, value);
            this._watchers.set(directory, fs_1.default.watchFile(directory, { interval: currentYear }, () => {
                delete require.cache[directory];
                try {
                    this.require(directory);
                }
                catch {
                    this._references.delete(directory);
                    this._listeners.delete(directory);
                    fs_1.default.unwatchFile(directory);
                    this._watchers.delete(directory);
                }
                this.events.emit(directory);
                this.events.emit("any", directory);
            }));
        }
        else {
            for (const key of Object.keys(oldObject)) {
                if (key === placeHolderKey)
                    continue;
                if (!value[key])
                    delete oldObject[key];
            }
            Object.assign(oldObject, value);
        }
        const ref = this._references.get(directory);
        if (!ref)
            return {};
        else
            return ref[placeHolderKey] ? ref[placeHolderKey] : ref;
    }
    addTemporaryListener(target, event, callback, method = "on") {
        const first = backtracker_1.BackTracker.stack.first();
        const absolute = path_1.default.normalize(`${first.dir}/${first.filename}`);
        if (!this._listeners.get(absolute))
            this._listeners.set(absolute, []);
        this._listeners.get(absolute).push([target, event, callback]);
        setImmediate(() => target[method](event, callback));
        return target;
    }
    resync(id, _from) {
        let from;
        if (typeof id === "string" && !id.startsWith("."))
            from = require.resolve(id);
        else
            from = _from ? _from : backtracker_1.BackTracker.stack.first().dir;
        if (Array.isArray(id))
            return id.map(item => this.resync(item, from));
        const directory = !path_1.default.isAbsolute(id) ? require.resolve(path_1.default.join(from, id)) : require.resolve(id);
        if (directory === __filename)
            throw new Error(selfReloadError);
        delete require.cache[directory];
        return this.require(directory);
    }
}
module.exports = Sync;
