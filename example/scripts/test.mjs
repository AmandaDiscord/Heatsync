const { sync } = globalThis.passthrough;

/**
 * @type {import("../modules/utilities.mjs")}
 */
const utils = await sync.import("../modules/utilities.mjs");

class Epic extends sync.ReloadableClass {
	/** @param {string} name */
	say(name) {
		return utils.default.epic(name);
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

export default { Epic: Epic2 }
