import passthrough from "../passthrough.js";
import url from "url";
const { sync } = passthrough;

sync.addTemporaryListener(sync.events, url.fileURLToPath(import.meta.url), () => {
	console.log("utils reloaded.");
});

export default {
	/**
	 * This function tells a user they are epic
	 */
	epic: function(name) {
		console.log(`${name} is epic`);
	}
}
