const passthrough = require("../passthrough.js");
const { reloader } = passthrough;

let utils = require("../modules/utilities.js");

reloader.sync("./modules/utilities", utils);

module.exports = {
	usage: "<Name>",
	description: "tell someone they are epic",
	process(name) {
		return utils.epic(name);
	}
}
