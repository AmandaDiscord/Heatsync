
const { sync } = globalThis.passthrough;

/**
 * @type {import("../modules/utilities.cjs")}
 */
const utils = sync.require("../modules/utilities.cjs");

class Epic extends sync.ReloadableClass {
	/** @param {string} name */
	say(name) {
		return utils.epic(name);
	}
}
class Epic2 extends Epic {
	/** @param {string} name */
	say(name) {
		super.say(name);
		console.log("and also me")
	}
}
sync.reloadClassMethods(Epic2);

module.exports = { Epic: Epic2 }
