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
    on<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    once<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    off<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    emit<E extends keyof WatcherEvents>(event: E, ...args: WatcherEvents[E]): boolean;
    addListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    eventNames(): Array<keyof WatcherEvents>;
    listenerCount(event: keyof WatcherEvents): number;
    listeners(event: keyof WatcherEvents): Array<Function>;
    prependListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    prependOnceListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
    rawListeners(event: keyof WatcherEvents): Array<Function>;
    removeAllListeners(event?: keyof WatcherEvents): this;
    removeListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
}
export = StatWatcher;
