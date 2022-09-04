import Heatsync from "../esm.mjs";
/** @type {import("../")} */
// @ts-ignore
const sync = new Heatsync();

// we obviously need to bounce around this instance of sync to other files
import passthrough from "./passthrough.js";
Object.assign(passthrough, { sync: sync });

sync.import([
	"./modules/utilities.mjs",
	"./scripts/test.mjs"
]);
