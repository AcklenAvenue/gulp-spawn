var cp = require("child_process"),
	path = require("path"),
	Duplexer = require("plexer"),
	gUtil = require("gulp-util"),
	through = require("through2");

var PLUGIN_NAME = "gulp-spawn";

var gulpSpawn = function() {
	"use strict";

	return gulpSpawn.stream.apply(this, arguments);
};

gulpSpawn.stream = function stream(options) {
	"use strict";

	// options.cmd required
	if (!options.cmd) {
		throw new gUtil.PluginError(PLUGIN_NAME,
			"command (\"cmd\") argument required");
	}

	var stream = through.obj(function(file, unused, cb) {

		if (file.isNull()) {
			stream.push(file);
			return cb();
		}

		// rename file if optional `filename` function specified
		if (options.filename && typeof options.filename === "function") {
			var dir = path.dirname(file.path),
				ext = path.extname(file.path),
				base = path.basename(file.path, ext);

			file.shortened = options.filename(base, ext);
			file.path = path.join(dir, file.shortened);
		}

		// spawn program
		var program = cp.spawn(options.cmd, options.args);

		// listen to stderr and emit errors if any
		var errBuffer = new Buffer(0);
		program.stderr.on("readable", function() {
			var chunk;
			while (chunk = program.stderr.read()) {
				errBuffer = Buffer.concat([
					errBuffer,
					chunk
				], errBuffer.length + chunk.length);
			}
		});
		program.stderr.on("end", function() {
			if (errBuffer.length) {
				stream.emit("error", new gUtil.PluginError(PLUGIN_NAME,
					errBuffer.toString("utf-8")));
			}
		});

		// check if we have a buffer or stream
		if (file.contents instanceof Buffer) {

			// create buffer
			var newBuffer = new Buffer(0);

			// when program receives data add it to buffer
			program.stdout.on("readable", function() {
				var chunk;
				while (chunk = program.stdout.read()) {
					newBuffer = Buffer.concat([
						newBuffer,
						chunk
					], newBuffer.length + chunk.length);
				}
			});

			// when program finishes call callback
			program.stdout.on("end", function() {
				file.contents = newBuffer;
				stream.push(file);
				cb();
			});

			// "execute"
			// write file buffer to program
			program.stdin.write(file.contents, function() {
				program.stdin.end();
			});

		} else { // assume we have a stream.Readable

			// stream away!
			file.contents = file.contents
				.pipe(new Duplexer(program.stdin, program.stdout));

			stream.push(file);
			cb();
		}
	});

	return stream;
};

gulpSpawn.once = function once(options) {
	"use strict";

	if (!options.cmd) {
		throw new gUtil.PluginError(PLUGIN_NAME, "command (\"cmd\") argument required");
	}

	var stream = through.obj(function _transform(file, unused, cb) {
		stream.push(file);
		cb();
	}, function _flush(cb) {
		var spawnOpts = {
			stdio: "inherit"
		};

		if (options.cwd) {
			spawnOpts.cwd = options.cwd;
		}

		var program = cp.spawn(options.cmd, options.args, spawnOpts);
		program.on("exit", function(code) {
			if (code !== 0) {
				stream.emit("error", new gUtil.PluginError(PLUGIN_NAME, "Command exited with code " + code +
					"\nCommand: " + options.cmd + " " + options.args.map(JSON.stringify).join(" ")
				));
			}
			cb();
		});
	});

	return stream;
};

var processTemplates = function(args, file) {
	"use strict";

	var templateContext = {
		file: file
	};

	if (typeof args === "string") {
		return gUtil.template(args, templateContext);
	} else if (Array.isArray(args)) {
		return args.map(function(arg) {
			return gUtil.template(arg, templateContext);
		});
	} else if (typeof args === "object") {
		var r = {};
		Object.keys(args).forEach(function(key) {
			r[key] = gUtil.template(args[key], templateContext);
		});

		return r;
	}
};

gulpSpawn.each = function each(options) {
	"use strict";

	if (!options.cmd) {
		throw new gUtil.PluginError(PLUGIN_NAME, "command (\"cmd\") argument required");
	}

	var stream = through.obj(function _transform(file, unused, cb) {
		stream.push(file);
		if (file.isNull()) {
			return cb();
		}

		var spawnOpts = {
			stdio: "inherit"
		};

		if (options.cwd) {
			spawnOpts.cwd = processTemplates(options.cwd, file);
		}

		var args = processTemplates(options.args, file);
		var program = cp.spawn(options.cmd, args, spawnOpts);
		program.on("exit", function(code) {
			if (code !== 0) {
				stream.emit("error", new gUtil.PluginError(PLUGIN_NAME, "Command exited with code " + code +
					"\nCommand: " + options.cmd + " " + options.args.map(JSON.stringify).join(" ")
				));
			}
			cb();
		});
	});

	return stream;
};

gulpSpawn.simple = function simple(options, cb) {
	"use strict";

	if (!options.cmd) {
		throw new gUtil.PluginError(PLUGIN_NAME, "command (\"cmd\") argument required");
	}

	var spawnOpts = {
		stdio: "inherit"
	};

	if (options.cwd) {
		spawnOpts.cwd = options.cwd;
	}

	var program = cp.spawn(options.cmd, options.args, spawnOpts);
	program.on("exit", function(code) {
		if (code !== 0) {
			throw new gUtil.PluginError(PLUGIN_NAME, "Command exited with code " + code +
				"\nCommand: " + options.cmd + " " + options.args.map(JSON.stringify).join(" ")
			);
		}
		cb();
	});
};

module.exports = gulpSpawn;
