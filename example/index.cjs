const Heatsync = require("heatsync");
const sync = new Heatsync();

globalThis.passthrough = { sync };

/** @type {typeof import("./scripts/test.cjs")} */
const test = sync.require("./scripts/test.cjs");

setInterval(() => {
	test.process("someone");
}, 5000);
