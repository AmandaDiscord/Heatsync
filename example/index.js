const Heatsync = require("../dist/index");
const sync = new Heatsync();

// we obviously need to bounce around this instance of sync to other files
const passthrough = require("./passthrough.js");
Object.assign(passthrough, { sync: sync });

sync.require([
	"./modules/utilities.js",
	"./scripts/test.js"
]);
