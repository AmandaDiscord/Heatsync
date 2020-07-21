const fs = require("fs");
const path = require("path");
const pj = path.join;

const Ref = require("./structures/Reference.js");

/**
 * @param {string} origin
 * @param {string} dir
 */
function localPath(origin, dir) {
	return pj(origin, dir);
}

const currentYear = new Date().getFullYear();

module.exports = class Reloader {
	/**
	 * @param {boolean} [log=false]
	 * @param {string} [dirname]
	 */
	constructor(log = false, dirname) {
		/**
		 * The absolute path to the directory Reloader was instanciated with.
		 */
		this.dirname = dirname ? path.resolve(dirname) : process.cwd();
		/**
		 * A boolean determining if Reloader should log modified/loaded filenames.
		 */
		this.log = log;
		/**
		 * @type {Array<{ dir: string, watcher: import("./typings/StatWatcher") }>}
		 */
		this.watchers = [];


		/**
		 * An EventEmitter which emits base reloaded filenames
		 */
		this.fileChangeEmitter = new (require("events").EventEmitter)();
	}
	/**
	 * Require files, add them to a watch list and return their values
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to path Reloader was instanciated with.
	 * @param {Array<string>} filenames
	 */
	require(filenames) {
		const values = []
		for (const filename of filenames) {
			const dir = path.isAbsolute(filename) ? filename : localPath(this.dirname, filename);
			const result = require(dir);
			let ref
			if (Ref.table.get(dir)) ref = Ref.table.get(dir);
			else ref = new Ref.Reference(dir, result);
			if (!this.watchers.find(watcher => watcher.dir == dir)) {
				if (this.log) console.log(`Loaded ${this.local(dir)}`);
				this.watchers.push({
					dir: dir,
					// @ts-ignore
					watcher: fs.watchFile(dir, { interval: currentYear }, () => {
						if (this.log) console.log(`Changed ${this.local(dir)}`);
						this._update(ref);
					})
				})
			}
			values.push(ref.value);
		}
		return values;
	}
	/**
	 * Calculates a path string local from the directory Reloader was instantiated with.
	 *
	 * ​
	 *
	 * Just pass it __filename in most cases.
	 * @param {string} dir
	 */
	local(dir) {
		return path.relative(this.dirname, dir);
	}
	/**
	 * @param {typeof Ref.Reference.prototype} reference
	 * @private
	 */
	_update(reference) {
		this.fileChangeEmitter.emit(this.local(reference.path));
		delete require.cache[require.resolve(reference.path)];
		const result = require(reference.path);
		reference.value = result;
	}
};
