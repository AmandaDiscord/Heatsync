const passthrough = require("../passthrough.js");
const { sync } = passthrough;

/**
 * @type {import("../modules/utilities")}
 */
const utils = sync.require("../modules/utilities");

module.exports = {
	usage: "<Name>",
	description: "tell someone they are epic",
	process(name) {
		return utils.epic(name);
	}
}
