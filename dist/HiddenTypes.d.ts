/**
 * These are typings for undocumented and unreachable types from Node.js The actual StatWatcher is a function but
 * for simplicity, I have documented it as a class as it EventEmitter.call's and can be constructed.
 * fs.watchFile overloads declare void however, it actually returns an instanceof StatWatcher. Do not use this type
 * for checking instanceof.
 *
 * Actual code for StatWatcher can be found at lib/internal/fs/watchers.js
 *
 * I really have no clue why I decided to document this. It's kinda over the top for this kind of module. Oh well.
 */
/// <reference types="node" />
import { EventEmitter } from "events";
declare const kOldStatus: unique symbol;
declare const kUseBigint: unique symbol;
declare const KFSStatWatcherStart: unique symbol;
declare const KFSStatWatcherRefCount: unique symbol;
declare const KFSStatWatcherMaxRefCount: unique symbol;
declare const kFSStatWatcherAddOrCleanRef: unique symbol;
declare const owner_symbol: unique symbol;
interface WatcherEvents {
    change: [import("fs").Stats, import("fs").Stats];
}
interface StatWatcher {
    addListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    emit<E extends keyof WatcherEvents>(event: E, ...args: WatcherEvents[E]): boolean;
    eventNames(): Array<keyof WatcherEvents>;
    listenerCount(event: keyof WatcherEvents): number;
    listeners(event: keyof WatcherEvents): Array<(...args: Array<any>) => any>;
    off<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    on<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    once<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    prependListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    prependOnceListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
    rawListeners(event: keyof WatcherEvents): Array<(...args: Array<any>) => any>;
    removeAllListeners(event?: keyof WatcherEvents): this;
    removeListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => any): this;
}
declare class StatWatcher extends EventEmitter {
    _handle: StatWatcher | null;
    [kOldStatus]: -1;
    [kUseBigint]: BigInt;
    [KFSStatWatcherRefCount]: 1;
    [KFSStatWatcherMaxRefCount]: 1;
    [owner_symbol]?: any;
    constructor(bigint: BigInt);
    [KFSStatWatcherStart](filename: string, persistent: boolean, interval: any): any;
    [kFSStatWatcherAddOrCleanRef](operate: "add" | "clean" | "cleanAll"): void;
    onchange?(newStatus: number, stats: ArrayLike<any>): void;
    private start;
    stop(): void;
    ref(): this;
    unref(): this;
}
export = StatWatcher;
