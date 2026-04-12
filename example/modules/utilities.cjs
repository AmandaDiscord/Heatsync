const { sync } = globalThis.passthrough;

sync.addTemporaryListener(sync.events, __filename, () => {
	console.log("utils reloaded.");
});

module.exports = {
	/**
	 * This function tells a user they are epic
	 * @param {string} name
	 */
	epic: function(name) {
		console.log(`${name} is epic`);
	}
}
