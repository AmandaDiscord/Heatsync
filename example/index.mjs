import Heatsync from "heatsync";
const sync = new Heatsync();

globalThis.passthrough = { sync };

/** @type {typeof import("./scripts/test.mjs")} */
const test = await sync.import("./scripts/test.mjs");
const instance = new test.default.Epic()

setInterval(() => {
	instance.say("someone");
}, 5000);
