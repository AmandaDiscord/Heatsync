const Heatsync = require("heatsync");
const sync = new Heatsync();

globalThis.passthrough = { sync };

/** @type {typeof import("./scripts/test.cjs")} */
const test = sync.require("./scripts/test.cjs");
const instance = new test.Epic()

setInterval(() => {
	instance.say("someone");
}, 5000);
