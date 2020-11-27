/// <reference types="node" />
import { EventEmitter } from "events";
declare class Reloader {
    dirname: string;
    events: EventEmitter;
    private _listeners;
    private _references;
    constructor(dirname?: string);
    require(id: string): any;
    require(id: Array<string>): any;
    require(id: string, _from: string): any;
    addTemporaryListener(target: EventEmitter, event: string, callback: (...args: Array<any>) => any, method?: "on" | "once"): EventEmitter;
}
export = Reloader;
