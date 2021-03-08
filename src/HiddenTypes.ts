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

import { EventEmitter } from "events";

const kOldStatus = Symbol("kOldStatus");
const kUseBigint = Symbol("kUseBigint");

const KFSStatWatcherStart = Symbol("KFSStatWatcherStart");
const KFSStatWatcherRefCount = Symbol("KFSStatWatcherRefCount");
const KFSStatWatcherMaxRefCount = Symbol("KFSStatWatcherMaxRefCount");
const kFSStatWatcherAddOrCleanRef = Symbol("kFSStatWatcherAddOrCleanRef");

const owner_symbol = Symbol("owner_symbol"); // I really don't know if this is correct.

interface WatcherEvents {
	change: [import("fs").Stats, import("fs").Stats];
}

declare class StatWatcher extends EventEmitter {
	public _handle: StatWatcher | null;
	public [kOldStatus]: -1;
	public [kUseBigint]: BigInt;
	public [KFSStatWatcherRefCount]: 1;
	public [KFSStatWatcherMaxRefCount]: 1;
	public [owner_symbol]?: any;

	public constructor(bigint: BigInt);

	public [KFSStatWatcherStart](filename: string, persistent: boolean, interval: any): any;
	public [kFSStatWatcherAddOrCleanRef](operate: "add" | "clean" | "cleanAll"): void;
	public onchange?(newStatus: number, stats: ArrayLike<any>): void;

	private start(): void;
	public stop(): void;
	public ref(): this;
	public unref(): this;

	// EventEmitter method typing overrides.

	public on<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public once<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public off<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public emit<E extends keyof WatcherEvents>(event: E, ...args: WatcherEvents[E]): boolean;

	public addListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public eventNames(): Array<keyof WatcherEvents>;
	public listenerCount(event: keyof WatcherEvents): number;
	public listeners(event: keyof WatcherEvents): Array<Function>;
	public prependListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public prependOnceListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
	public rawListeners(event: keyof WatcherEvents): Array<Function>;
	public removeAllListeners(event?: keyof WatcherEvents): this;
	public removeListener<E extends keyof WatcherEvents>(event: E, listener: (...args: WatcherEvents[E]) => void): this;
}

export = StatWatcher;
