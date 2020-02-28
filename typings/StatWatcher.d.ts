/**
 * This is typings for an undocumented and unreachable type from Node.js The actual StatWatcher is a function but
 * for simplicity, I have documented it as a class as it EventEmitter.call's and can be constructed.
 * fs.watchFile overloads declare void however, it actually returns an instanceof StatWatcher. Do not use this type
 * for checking instanceof.
 *
 * Actual code for StatWatcher can be found at lib/internal/fs/watchers.js
 */
undefined;

import EventEmitter from "events";

const kOldStatus = Symbol("kOldStatus");
const kUseBigint = Symbol("kUseBigint");

declare class StatWatcher extends EventEmitter {
	constructor(bigint: BigInt);

	private _handle: null;

	[Symbol(kOldStatus)]: -1;
	[Symbol(kUseBigint)]: undefined;
}
export = StatWatcher;
