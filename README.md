# Heatsync
This is a module to watch and reload CommonJS and ES Modules on modification and sync results

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without restarting the application. Luckily, that's where Heatsync comes in.

## HeatSync does not replace global.require or global.import
This system is explicitly opt in and requires you to construct your own heatsync instance. References from potentially other heatsync instances are not shared and are not accessible unless they have been intentially made accessible through the likes of global variables or exports.

# How It Works
Objects. HeatSync only supports importing modules that export a pure*, non-frozen Object.
Pure Objects that haven't been frozen are a mutable list of references and on file change, the Object given to you by HeatSync is repopulated with references from the new Object exports.

Almost all other primitive types in JS are essentially immutable and this logic does not hold up for them nor can their values be changed (aside from numbers through operators which do assignment and Arrays). Arrays are considered Objects and theoretically could be supported by HeatSync, but we found it much simpler for both us and the end user to only support Objects as exports. Everything except Objects will refuse to load/reload.

\* Classes can be treated like Objects, but testing has shown that attempting to delete all of the properties of the class and then repopulate them does not work. I believe Node protects specific properties without throwing an error similar to how ES Modules' default export property itself is readonly, but its child properties are not. In cases where you want to export a class and have that file reload, you need to export any classes wrapped in an Object as the export.

## Important Notes
- Do not destructure Objects imported by HeatSync. HeatSync preserves Object identity, not individual property references.
- If you make use of any kind of bundler, this system will not work unless you specify files to be excluded from bundling that you expect to change often.
- HeatSync does not reset application state. If a file that's reloaded contains any timers or database connections or anything else that can be persistent, it will persist. You will need to cleanup stuff yourself. For timers and events, HeatSync does offer helper functions that make temporary variants that automatically get cleared on file reload.
- Some files that interact with native modules even if not direclty may cause issues depending on how the native module was built. A case we've found is uWS.js where reloading a file specifying route handlers caused the process to crash. Be careful.
- The default fs watch function is fs.watch, but is apparently inconsistent across multiple operating systems. There is an option to change it depending on your OS. Some may also recommend using the chokidar lib
- With sync.remember, it tries its best to parse out the variable name to use it as a key in combination with the path of the src file. Sometimes it can fail in cases like minification or weird white spacing. If you try to use the same variable name in different scopes, it'd be valid code, but the remember can break this way as it's a name conflict internally. As a fallback, you can supply your own key as another param to sync.remember. In cases of minification or js bundling, if src maps are present, it can use the actual file name from the original file for the src path as part of the key, but if not then it uses the minified js path.
- The same name restriction applies to sync.reloadClassMethods, but you cannot supply a key, so please avoid name conflicts.

# ESM Support
For everywhere you would use a sync.require, you would instead use sync.import where sync.import is returning:
Promise<any>; or an Array of those objects if using multi ID resolution. ImportAttributes are supported like as required to import json files. Multi ID resolution uses the same ImportAttributes for every entry if supplied.

## How does ESM support work?
ESM doesn't allow you to modify the require.cache like in CJS, but there is a workaround. You can add URL query strings to the end of the id passed to the import statement which are always different (like Date.now()) and the imported module will be re-fetched.

HeatSync does a ton of stuff for you though and is much more than just appending a query string. The rest is just HeatSync's usual (ab)use of memory references. Adding clean and functional ESM support was ugly, so if you appreciate my work, please consider supporting me.

## IMPORTANT WITH ESM
Imports in ESM are immutable, so the Object given to you by HeatSync isn't the direct Object from import, but is a spread of the import into an Object that can be mutated. Because of the fact that HeatSync cannot remove the properties of the old imports or the internal state of the import itself, you are effectively leaking with each reload of a module.

## Does This Support Files On The Internet?
No. This also won't work in browsers. This is only intended for use in Node.js. Bun and deno are also totally untested/considered. They do offer node apis for imports, but if they change in the future, this module will probably break.

# Basic Usage
```js
const Heatsync = require("heatsync");
const sync = new Heatsync();

// Heatsync offers native-like module resolution
// relative paths are based on the file the function is being called in similar to global.require or global.import.
// absolute paths also work.
// but wait, there's more! It also supports modules from some registries like node_modules.
const utils = sync.require("./utils.js");

// The require method also accepts an Array of IDs where IDs can be:
// A relative path, an absolute path, or a module name from some registries like node_modules.
const [file1, file2, file3] = sync.require([
	"./epic.js",
	"./poggers.js",
	"../lib/controller.js"
]);

sync.events.on("error", console.error); // or node will kill your process if there is a require error when a file changes.
// For the initial require, any errors are forwarded to the call site.
```

# Advanced Usage
```js
// remembering variables across file reloads.
const index = sync.remember(() => new Map()); // returns the Map so your "index" variable is the Map.

// class instance methods getting updated (cannot do properties)
class CanReload extends sync.reloadClassMethods(() => CanReload) {
	constructor() {
		// nothing in here or in the property initializers reload.
	}

	magic() {
		// everything in here can reload without having to construct a new instance of the class
	}
}
```

# Features
- Require/import specific modules that can be reloaded when the file changes if options.watchFS is true (default: true).
- Add temporary Timeouts, Intervals, and events to EventEmitters that get removed when the file passing the callback to them gets reloaded.
- Reload modules manually (can be unsafe in specific cases)
- Remember variable references to be carried over across file reloads
- Mark classes as reloadable where their instances get their **methods** updated. (You cannot do anything that would be done from within the new constructor which is where properties are initialized)
- Can require modules installed to registries like node_modules, not just relative or known A-O-T absolute paths, but doesn't perform deep resolution of all child files for reloading. Only the root file that is resolved. Module developers would have to opt into this system.
