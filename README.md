# Heatsync
This is a module to watch and reload CommonJS and ES Modules on modification and sync results with objects

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without restarting the application. Luckily, that's where Heatsync comes in.

# How it works and Caveats
Objects. HeatSync only supports importing modules that export an Object.*
Objects are a list of references and on file change, all of the properties of the old imported Object are deleted so that they can be garbage collected and then repopulated with references from the new Object when HeatSync re-imports the module.** The result is that the return value from sync.require or sync.import will have its properties updated and these changes are available without a restart. All imports of the same module through HeatSync share the same Object reference as if it were imported natively.

* Classes can be treated like Objects, but testing has shown that attempting to delete all of the properties of the class and then repopulate them does not work. I believe Node protects specific properties without throwing an error similar to how ES Modules' default export property itself is readonly, but its child properties are not. In cases where you want to export a class and have that file reload, you need to export any classes wrapped in an Object as the export.

** Almost all other primitive types in JS are essentially immutable and this logic does not hold up for them nor can their values be changed (aside from numbers through operators which do assignment and Arrays). Arrays are considered Objects and theoretically could be supported by HeatSync, but we found it much simpler for both us and the end user to only support pure Objects as exports. Everything else will refuse to load/reload.

## Object.create
Objects created via Object.create have the possibility to not have a constructor property such as through Object.create(null). HeatSync will throw an Error saying that it is not an Object due to it checking the constructor.name to see if it equals "Object". Should you really desire using Object.create and HeatSync isn't playing nice, you must assign a constructor property and you can reference the global Object.constructor as the value.

# ESM Support
ESM support was added in version 2.3.0. For everywhere you see a sync.require, you would use sync.import instead where sync.import is returning:
Promise<any>; or an Array of those objects if using multi ID resolution.

## How does ESM support work?
You can add URL query strings to the import statement which are always different and the imported module will be refreshed (HeatSync makes it so that the **properties** of the old Object can get garbage collected, but not the Object itself nor the internal state representing the import. You will still have to refresh a lot of modules to hit your max memory, but the fact that HeatSync is causing a memory leak with **ESM only** is still something to consider. If ESM is avoidable, please avoid it if hot reloading is important to you).

HeatSync does a ton of stuff for you though and is much more than just appending a query string. The rest is just HeatSync's usual (ab)use of memory references.

# Basic Usage
```js
const Heatsync = require("heatsync");
const sync = new Heatsync();

// Heatsync offers native-like module resolution, but without intellisense for fs struct like you may expect from global.require or global.import.
// relative paths are based on the file the function is being called in similar to global.require or global.import
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

# Examples
Code for an example can be found at example/

# Features
- Require/import specific modules that can be reloaded when the files changes if options.watchFS is true (default: true).
- Add temporary Timeouts, Intervals, and events to EventEmitters that get removed when the file housing them gets reloaded.
- Reload modules manually (can be unsafe in specific cases)
- Remember variable references to be carried over across file reloads
- Mark classes as reloadable where their instances get their **methods** updated. (You cannot do anything that would be done from within the new constructor)
