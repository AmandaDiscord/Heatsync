"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const backtracker_1 = require("backtracker");
const currentYear = new Date().getFullYear();
class Reloader {
    constructor(dirname = process.cwd()) {
        const from = backtracker_1.BackTracker.stack.first;
        this.dirname = !path_1.default.isAbsolute(dirname) ? path_1.default.join(from.dir, dirname) : dirname;
        this.events = new events_1.EventEmitter();
        this._listeners = new Map();
        this._references = new Map();
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
        if (typeof id === "string" && !id.startsWith("."))
            throw new TypeError("Reloader does not support reloading npm modules");
        const from = _from ? _from : backtracker_1.BackTracker.stack.first.dir;
        if (Array.isArray(id))
            return id.map(item => this.require(item, from));
        const directory = !path_1.default.isAbsolute(id) ? path_1.default.join(from, id) : id;
        const value = require(directory);
        if (typeof value !== "object" || Array.isArray(value))
            throw new TypeError("Required files can only export Objects in order to properly reload");
        const oldObject = this._references.get(directory);
        if (!oldObject) {
            this._references.set(directory, value);
            fs_1.default.watchFile(directory, { interval: currentYear }, () => {
                delete require.cache[directory];
                try {
                    this.require(directory);
                }
                catch {
                    this._references.delete(directory);
                }
                this.events.emit(directory);
                this.events.emit("any", directory);
            });
        }
        else {
            for (const key of Object.keys(oldObject)) {
                if (!value[key])
                    delete oldObject[key];
            }
            Object.assign(oldObject, value);
        }
        return value;
    }
    addTemporaryListener(target, event, callback, method = "on") {
        const first = backtracker_1.BackTracker.stack.first;
        const absolute = path_1.default.normalize(`${first.dir}/${first.filename}`);
        if (!this._listeners.get(absolute))
            this._listeners.set(absolute, []);
        this._listeners.get(absolute).push([target, event, callback]);
        return target[method](event, callback);
    }
}
module.exports = Reloader;
