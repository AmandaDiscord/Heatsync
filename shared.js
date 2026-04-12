module.exports = {
	selfReloadError: "Do not attempt to re-require Heatsync. If you REALLY want to, do it yourself with require.cache and deal with possibly ticking timers and event listeners, but don't complain if something breaks :(",
	nonObjectErrorPart: "does not seem to export an Object and as such, changes made to the file cannot be reflected as the value would be immutable. Importing non Objects through HeatSync isn't supported and may be erraneous. Exports being Classes will not reload properly",
	resyncFailError: "Module failed to resync",
	parseKeyError: "Sorry, couldn't parse out the variable name from the line where you used sync.remember. Please provide a key as the second argument instead!",
	failedSymbol: Symbol("LOADING_MODULE_FAILED")
}
