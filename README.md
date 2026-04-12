# Heatsync
This is a module to watch and reload CommonJS and ES Modules on modification and sync results with objects

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without restarting the application. Luckily, that's where Heatsync comes in.

# How It Works
Objects. HeatSync only supports importing modules that export an Object.*
Objects are a mutable list of references and on file change, all of the properties of the old imported Object are deleted so that they can be garbage collected and then repopulated with references from the new Object when HeatSync drops the require cache of the module and re-imports it.** All imports of the same module through the same HeatSync instance share the same Object reference; acting as a middle-man for require.cache.

\* Classes can be treated like Objects, but testing has shown that attempting to delete all of the properties of the class and then repopulate them does not work. I believe Node protects specific properties without throwing an error similar to how ES Modules' default export property itself is readonly, but its child properties are not. In cases where you want to export a class and have that file reload, you need to export any classes wrapped in an Object as the export.

\*\* Almost all other primitive types in JS are essentially immutable and this logic does not hold up for them nor can their values be changed (aside from numbers through operators which do assignment and Arrays). Arrays are considered Objects and theoretically could be supported by HeatSync, but we found it much simpler for both us and the end user to only support Objects as exports. Everything except Objects will refuse to load/reload.

## Heatsync Instances
For privacy in different scopes, heatsync requires you to instantiate it for use in your immediate scope and other scopes you decide to pass/make it accessible to. This can be a caveat depending on how you and others want to use heatsync.

## JS Bundlers
If you make use of any kind of bundler, this system will not work unless you specify files to be excluded from bundling that you expect to change often.

# ESM Support
ESM support was added in version 2.3.0. For everywhere you see a sync.require, you would use sync.import instead where sync.import is returning:
Promise<any>; or an Array of those objects if using multi ID resolution. ImportAttributes are supported like as required to import json files. Multi ID resolution uses the same ImportAttributes for every entry if supplied.

## How does ESM support work?
ESM doesn't allow you to modify the require.cache like in CJS, but there is a workaround. You can add URL query strings to the end of the id passed to the import statement which are always different (like Date.now()) and the imported module will be re-fetched (HeatSync makes it so that the **properties** of the old Object can get garbage collected, but it cannot clean up the old Object itself nor the internal state representing the import if any. You will have to refresh a lot of modules to hit your max memory - and that scales with installed memory in your machine, but the fact that HeatSync is effectively causing a memory leak with **ESM only** is still something to consider when choosing between building your app for CJS or ESM).

HeatSync does a ton of stuff for you though and is much more than just appending a query string. The rest is just HeatSync's usual (ab)use of memory references. Adding clean and functional ESM support was ugly, so if you appreciate my work, please consider supporting me.

## Does This Support Files On The Internet?
No. This also won't work in browsers. This is only intended for use in Node.js. Bun and deno are also totally untested/considered. If they do work, cool, but I didn't intend for it to work and future updates will reflect this intent as well unless enough people request this functionality. Only then, possibly.

# Basic Usage
```js
const Heatsync = require("heatsync");
const sync = new Heatsync();

// Heatsync offers native-like module resolution, but without intellisense for fs struct like you may expect from global.require or global.import.
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

# Features
- Require/import specific modules that can be reloaded when the file changes if options.watchFS is true (default: true).
- Add temporary Timeouts, Intervals, and events to EventEmitters that get removed when the file passing the callback to them gets reloaded.
- Reload modules manually (can be unsafe in specific cases)
- Remember variable references to be carried over across file reloads
- Mark classes as reloadable where their instances get their **methods** updated. (You cannot do anything that would be done from within the new constructor which is where properties are initialized)
- Can require modules installed to registries like node_modules, not just relative or known A-O-T absolute paths, but doesn't perform deep resolution of all child files for reloading. Only the root file that is resolved. Module developers would have to opt into this system.
