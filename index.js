// @ts-check
const fs = require("fs");
const path = require("path");
const pj = path.join;

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
		 * A Map keyed by absolute file paths which are being watched by Reloader.
		 * @type {Map<string, import("./typings/StatWatcher")>}
		 */
		this.watched = new Map();
		/**
		 * An Array of Objects representing files being synced by the sync method with a property object representing said file's state.
		 * @type {Array<{filename: string, object: any}>}
		 */
		this.syncers = [];
		/**
		 * An EventEmitter which emits reloaded filenames
		 */
		this.reloadEvent = new (require("events").EventEmitter)();
		/**
		 * A boolean determining if Reloader should log modified/loaded filenames.
		 */
		this.log = log;
	}
	/**
	 * Watch an Array of paths to files but do not require them immediately.
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to path Reloader was instanciated with.
	 * @param {Array<string>} filenames
	 */
	watch(filenames) {
		for (let filename of filenames) {
			filename = path.isAbsolute(filename) ? filename : localPath(this.dirname, filename);
			if (!this.watched.has(filename)) {
				if (this.log) console.log(`Watching ${filename}`);
				this.watched.set(filename,
					// @ts-ignore
					fs.watchFile(filename, { interval: currentYear }, () => {
						if (this.log) console.log(`Changed ${filename}`);
						this._update(filename);
					})
				);
			}
		}
		return this;
	}
	/**
	 * Watch an Array of paths to files and require them immediately.
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to the path Reloader was instanciated with.
	 * @param {Array<string>} filenames
	 */
	watchAndLoad(filenames) {
		this.watch(filenames);
		for (let filename of filenames) {
			filename = path.isAbsolute(filename) ? filename : localPath(this.dirname, filename);
			this._update(filename);
		}
		return this;
	}
	/**
	 * Sync results with a watched file to an Object.
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to the path Reloader was instanciated with.
	 * @param {string} filename
	 * @param {Object} object
	 */
	sync(filename, object) {
		filename = path.isAbsolute(filename) ? filename : localPath(this.dirname, filename);
		if (!this.watched.has(filename)) console.error(`A file asked to keep an object in sync with ${filename}, but that file is not being watched.`);

		this.syncers.push({ filename, object });
		return this;
	}
	/**
	 * Force a path to a file to reload.
	 *
	 * ​
	 *
	 * When using relative paths with this method, you must make them relative to the path Reloader was instanciated with.
	 * @param {string} filename
	 */
	resync(filename) {
		filename = path.isAbsolute(filename) ? filename : localPath(this.dirname, filename);
		if (!this.watched.has(filename)) {
			throw new Error(`Reloader: asked to force resync ${filename}, but that file is not being watched.\n(Could resync, but what's the point? Likely the wrong filename.)`);
		}
		if (this.log) console.log(`Force resync ${filename}`);
		this._update(filename);
		return this;
	}
	/**
	 * @param {string} filename
	 * @private
	 */
	_update(filename) {
		this.reloadEvent.emit(path.basename(filename));
		const syncers = this.syncers.filter(o => o.filename == filename);
		delete require.cache[require.resolve(filename)];
		const result = require(filename);
		syncers.forEach(syncer => Object.assign(syncer.object, result));
	}
};
