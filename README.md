# Reloader
A module to watch and reload JS Modules on modification and sync results with objects

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without a restart. Luckily, that's where Reloader comes in.

## Note
When including Reloader in your application, Reloader, by default, determines paths relative to the current working directory. This method could cause issues with process monitors such as pm2 or starting your application in a directory that is not your project root. To circumvent this, you can optionally, pass a dirname which can be relative or absolute which Reloader will then use. The easiest to pass it would be __dirname from the file you're constructing it in.

# Examples

## index.js
```js
const Reloader = require("@amanda/reloader");
const reloader = new Reloader(true);

// we obviously need to bounce around this instance of reloader to other files
const passthrough = require("./passthrough.js"); // module.exports = {};
Object.assign(passthrough, { reloader, reloadEvent: reloader.reloadEvent });

reloader.watch([
	"./modules/utilities.js",
	"./scripts/test.js"
]);
```

## modules/utilities.js
```js
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
```

## scripts/test.js
```js
const passthrough = require("../passthrough.js");
const { reloader } = passthrough;

let utils = require("../modules/utilities.js");

reloader.sync("./modules/utilities", utils);

module.exports = {
	usage: "<Name>",
	description: "tell someone they are epic",
	process(name) {
		return utils.epic(name);
	}
}
```

So then we require scripts/test.js somewhere and call test.process("John Doe");
It will output "John Doe is epic"

But let's say you modify utils.epic to be
```js
function(name) {
	console.log(`${name} 100% is epic`);
}
```

Since it's being watched by the index and scripts/test.js is asking reloader to sync results with the utils object, as soon as there is a difference in the files in the filesystem, the reloader will drop the require cache for modules/utilities.js and re-require the file immediatly after and apply the result to all files asking for the results to be synced.
Since there is also
```js
reloadEvent.once(path.basename(__filename), () => {
	console.log("utils reloaded.");
});
```
The console will say "utils reloaded."
Usage of the reloadEvent can be helpful for if you want to add listeners to EventEmitters then remove them as to not duplicate listeners once a file gets reloaded.

If we called test.process("John Doe"); again after utilities has been reloaded, the console will now print "John Doe 100% is epic"
test.js is also being watched by the reloader so if a file wants results to sync on update, the same concept as above applies.


There is also a one-shot method to watch and load files conveniently named watchAndLoad
which also accepts an array of paths. The difference between Reloader.watch and Reloader.watchAndLoad is that Reloader.watch does not require files which means they are not in the process' require cache. This allows files to require the watched files then ask to sync them. Which is helpful for utility files
