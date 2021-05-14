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
        this.events = new events_1.EventEmitter();
        this._listeners = new Map();
        this._references = new Map();
        this._watchers = new Map();
        this._npmMods = [];
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
        if (typeof id === "string" && !id.startsWith(".") && (!path_1.default.isAbsolute(id) || id.includes("node_modules"))) {
            from = require.resolve(id);
            this._npmMods.push(from);
        }
        else
            from = _from ? _from : backtracker_1.BackTracker.stack.first.dir;
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
        if (this._npmMods.includes(directory)) {
            watch(directory);
            const instance = this;
            function watch(d) {
                const m = require.cache[d];
                if (!m)
                    return;
                for (const child of m.children) {
                    watch(child.filename);
                    instance._watchers.set(child.filename, fs_1.default.watchFile(child.filename, { interval: currentYear }, () => {
                        instance.resync(directory);
                        fs_1.default.unwatchFile(child.filename);
                        instance._watchers.delete(child.filename);
                    }));
                }
            }
        }
        const oldObject = this._references.get(directory);
        if (!oldObject) {
            this._references.set(directory, value);
            this._watchers.set(directory, fs_1.default.watchFile(directory, { interval: currentYear }, () => {
                if (this._npmMods.includes(directory))
                    return this.resync(directory);
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
        const first = backtracker_1.BackTracker.stack.first;
        const absolute = path_1.default.normalize(`${first.dir}/${first.filename}`);
        if (!this._listeners.get(absolute))
            this._listeners.set(absolute, []);
        this._listeners.get(absolute).push([target, event, callback]);
        return target[method](event, callback);
    }
    resync(id, _from, _child) {
        let from;
        if (typeof id === "string" && !id.startsWith("."))
            from = require.resolve(id);
        else
            from = _from ? _from : backtracker_1.BackTracker.stack.first.dir;
        if (Array.isArray(id))
            return id.map(item => this.resync(item, from));
        const directory = !path_1.default.isAbsolute(id) ? require.resolve(path_1.default.join(from, id)) : require.resolve(id);
        if (directory === __filename)
            throw new Error(selfReloadError);
        const mod = require.cache[directory];
        if (mod) {
            for (const child of mod.children) {
                this.resync(child.filename, undefined, true);
            }
        }
        delete require.cache[directory];
        if (!_child)
            return this.require(directory);
        else
            return void 0;
    }
}
module.exports = Sync;
