/// <reference types="node" />
import { EventEmitter } from "events";
declare class Sync {
    events: EventEmitter;
    private _listeners;
    private _references;
    private _watchers;
    private _npmMods;
    constructor();
    require(id: string): any;
    require(id: Array<string>): any;
    require(id: string, _from: string): any;
    addTemporaryListener(target: EventEmitter, event: string, callback: (...args: Array<any>) => any, method?: "on" | "once"): EventEmitter;
    resync(id: string): any;
    resync(id: Array<string>): any;
    resync(id: string, _from?: string): any;
    resync(id: string, _from?: string, _child?: boolean): any;
}
export = Sync;
