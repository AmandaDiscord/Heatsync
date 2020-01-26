// @ts-check
const fs = require("fs");
const path = require("path");
const pj = path.join;

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
		let logging = false;
		let directory = undefined;
		if (typeof log == "string") {
			directory = log;
			if (typeof dirname == "boolean") logging = dirname
		} else {
			logging = log
			directory = dirname
		}
		this.dirname = directory ? path.resolve(directory) : process.cwd();
		this.watched = new Map();
		this.syncers = [];
		this.reloadEvent = new (require("events").EventEmitter)();
		this.log = log;
	}
	/**
	 * @param {Array<string>} filenames
	 */
	watch(filenames) {
		for (let filename of filenames) {
			filename = localPath(this.dirname, filename);
			if (!this.watched.has(filename)) {
				if (this.log) console.log(`Watching ${filename}`);
				this.watched.set(filename,
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
	 * @param {Array<string>} filenames
	 */
	watchAndLoad(filenames) {
		this.watch(filenames);
		for (const filename of filenames) {
			this._update(localPath(this.dirname, filename));
		}
		return this;
	}
	/**
	 * @param {string} filename
	 * @param {Object} object
	 */
	sync(filename, object) {
		filename = localPath(this.dirname, filename);
		if (!this.watched.has(filename)) console.error(`A file asked to keep an object in sync with ${filename}, but that file is not being watched.`);

		this.syncers.push({ filename, object });
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
