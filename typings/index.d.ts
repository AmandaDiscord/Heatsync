import events = require("events");

declare class Reloader {
	constructor(dirname: string, log?: boolean);

	public dirname: string;
	public watched: Map<string, any>;
	public syncers: Array<{ filename: string; object: any }>;
	public reloadEvent: events.EventEmitter;
	public log: boolean;

	private _update(filename: string): void;

	public watch(filenames: Array<string>): this;
	public watchAndLoad(filenames: Array<string>): this;
	public sync(filename: string, object: any): this;
}
export = Reloader;
