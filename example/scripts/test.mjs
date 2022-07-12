import passthrough from "../passthrough";
const { sync } = passthrough;

/**
 * @type {import("../modules/utilities.mjs")}
 */
const utils = await sync.import("../modules/utilities.mjs");

export default {
	usage: "<Name>",
	description: "tell someone they are epic",
	process(name) {
		return utils.default.epic(name);
	}
}
