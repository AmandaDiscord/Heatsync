const path = require("path");

const passthrough = require("../passthrough.js");
const { reloadEvent } = passthrough;

reloadEvent.once(path.basename(__filename), () => {
	console.log("utils reloaded.");
});

module.exports = {
	/**
	 * This function tells a user they are epic
	 */
	epic: function(name) {
		console.log(`${name} is epic`);
	}
}
