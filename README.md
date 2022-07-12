# Heatsync
This is a module to watch and reload CommonJS and ES Modules on modification and sync results with objects

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without restarting the application. Luckily, that's where Heatsync comes in.

# ESM Support
ESM support was added in version 2.3.0. For everywhere you see a sync.require, you would use sync.import instead where sync.import is returning:
Promise<{ default: any, prototype?: any }>; or an Array of those objects if using multi ID resolution.

## How does ESM support work?
You can add URL query strings to the import statement which are always different and the imported module will be refreshed. HeatSync does a ton of stuff for you though and is much more than just that. The rest is just HeatSync's usual (ab)use of memory references.

## Caveats for ESM
- None. Nope, none at all. Everything works as expected. Totally didn't have to spend a bunch of time debugging.

# Basic Usage
```js
const Heatsync = require("heatsync");
const sync = new Heatsync();

// Heatsync offers native-like module resolution, but without types for fs struct.
// relative paths based on the file the function is being called will work.
// absolute paths also work.
const utils = sync.require("./utils.js");

// The require method also accepts an Array of IDs where IDs can be:
// A relative path or an absolute path.
const [file1, file2, file3] = sync.require([
	"./epic.js",
	"./poggers.js",
	"../lib/controller.js"
]);

sync.events.on("error", console.error); // or node will kill your process if there is a require error
```

# How it works
Object.assign and the delete keyword mutates the state of an Object. which means it doesn't replace the reference. You can assign values to an Object through Object.assign and the new/updated properties will appear in other files so long as you have the same reference.


# Examples
Code for an example can be found at example/
Follow along for a better understanding

First, we require scripts/test.js somewhere and call test.process("John Doe");
It will output "John Doe is epic"

But let's say you modify utils.epic to be
```js
function(name) {
	console.log(`${name} 100% is epic`);
}
```

Since it's required through Heatsync, Heatsync will drop the require cache for the file and then re-require the file, then apply the changes of the file to the reference it returned to you through the require method which means that the changes will be available to you immediately wherever you used Heatsync's require method to require said file. Subsequent calls of the function from the example with the same arguments will now write "John Doe 100% is epic" to the console.
