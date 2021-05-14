const passthrough = require("../passthrough.js");
const { sync } = passthrough;

sync.addTemporaryListener(sync.events, __filename, () => {
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
