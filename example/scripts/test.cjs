
const { sync } = globalThis.passthrough;

/**
 * @type {import("../modules/utilities.cjs")}
 */
const utils = sync.require("../modules/utilities.cjs");

module.exports = {
	usage: "<Name>",
	description: "tell someone they are epic",
	/** @param {string} name */
	process(name) {
		return utils.epic(name);
	}
}
