# Heatsync
This is a module to watch and reload JS Modules on modification and sync results with objects

In applications which require high uptime and are constantly being worked on as the development process normally is, developers might find it necessary to reload modules and have their changes take effect immediately without restarting the application. Luckily, that's where Heatsync comes in.

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
