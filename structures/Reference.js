/**
 * @type {Map<string, Reference>}
 */
const table = new Map();

/**
 * @template T
 */
class Reference {
	/**
	 * @param {string} path
	 * @param {T} value
	 */
	constructor(path, value) {
		Object.defineProperty(this, "_table", { value: table, configurable: false });
		this.path = path;
		this.value = value;
		table.set(this.path, this);
	}
	/**
	 * @param {T} value
	 */
	update(value) {
		this.value = value;
		return value;
	}
}

module.exports = { Reference, table };
