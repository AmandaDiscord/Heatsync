"use strict";
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
const events_1 = require("events");
const kOldStatus = Symbol("kOldStatus");
const kUseBigint = Symbol("kUseBigint");
const KFSStatWatcherStart = Symbol("KFSStatWatcherStart");
const KFSStatWatcherRefCount = Symbol("KFSStatWatcherRefCount");
const KFSStatWatcherMaxRefCount = Symbol("KFSStatWatcherMaxRefCount");
const kFSStatWatcherAddOrCleanRef = Symbol("kFSStatWatcherAddOrCleanRef");
const owner_symbol = Symbol("owner_symbol"); // I really don't know if this is correct.
module.exports = StatWatcher;
