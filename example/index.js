const Reloader = require("../index.js");
const reloader = new Reloader(true, __dirname);

// we obviously need to bounce around this instance of reloader to other files
const passthrough = require("./passthrough.js");
Object.assign(passthrough, { reloader, reloadEvent: reloader.reloadEvent });

reloader.watch([
	"./modules/utilities.js",
	"./scripts/test.js"
]);
