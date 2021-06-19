/// <reference types="node" />
import { EventEmitter } from "events";
declare class Sync {
    /**
     * An EventEmitter which emits absolute reloaded file paths.
     */
    events: EventEmitter;
    /**
     * A Map keyed by absolute file paths which details listeners added to a target.
     */
    private _listeners;
    /**
     * A Map keyed by absolute file paths which holds references to imports.
     */
    private _references;
    /**
     * A Map keyed by absolute file paths which are being watched by heatsync.
     */
    private _watchers;
    constructor();
    /**
     * The return value is any, because TypeScript doesn't like dynamically typed return values for import.
     * It expects a string literal. Cannot be a Generic extending "" either.
     * You will have to type the return value yourself if typings are important to you.
     */
    require(id: string): any;
    require(id: Array<string>): any;
    require(id: string, _from: string): any;
    addTemporaryListener<Target extends EventEmitter>(target: Target, event: Parameters<Target["on"]>[0], callback: (...args: Array<any>) => any, method?: "on" | "once"): Target;
    resync(id: string): any;
    resync(id: Array<string>): any;
    resync(id: string, _from?: string): any;
    resync(id: string, _from?: string): any;
}
export = Sync;
