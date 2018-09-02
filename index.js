"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var inquirer = require("inquirer");
var chalk_1 = __importDefault(require("chalk"));
var program = require("commander");
var child_process_1 = require("child_process");
var fs_1 = require("fs");
var untildify = require('untildify');
var rxjs_1 = require("rxjs");
var operators_1 = require("rxjs/operators");
var _package = require('./package.json');
function FileInfo(path, stats) {
    return { path: path, stats: stats };
}
function mdfind(name, excludeDirs) {
    var mdfind = child_process_1.spawn("mdfind", ['-name', name]);
    var onError = rxjs_1.fromEvent(mdfind.stderr, "error")
        .pipe(operators_1.tap(function (err) { return console.error("error", err); }))
        .pipe(operators_1.mergeMap(function (err) { return rxjs_1.throwError(err); }));
    var onClose = rxjs_1.fromEvent(mdfind, "close")
        .pipe(operators_1.tap(function (value) { return console.log("closed", value[0]); }));
    var rx_stat = rxjs_1.bindNodeCallback(fs_1.stat);
    return rxjs_1.fromEvent(mdfind.stdout, "data")
        .pipe(operators_1.takeUntil(onError), operators_1.takeUntil(onClose), operators_1.buffer(onClose), operators_1.switchMap(function (value) { return rxjs_1.from(value.toString().split('\n').sort()); }), operators_1.filter(function (p) { return !excludeDirs.some(function (pp) { return p.match(pp) != null; }); }), operators_1.mergeMap(function (p) { return rx_stat(p)
        .pipe(operators_1.map(function (s) { return FileInfo(p, s); }), operators_1.catchError(function (err) { return rxjs_1.of(FileInfo(p)); })); }));
}
function print(value) {
    if (!value.stats) {
        console.log(chalk_1.default.red(value.path));
    }
    else if (value.stats.isFile())
        console.log(chalk_1.default.blueBright(value.path));
    else if (value.stats.isDirectory())
        console.log(chalk_1.default.cyanBright(value.path));
}
function choice(fileInfo) {
    var module = inquirer.createPromptModule();
    var choices = fileInfo
        .filter(function (f) { return f.stats && (f.stats.isFile() || f.stats.isDirectory()); })
        .map(function (f) { return { name: f.path }; });
    return rxjs_1.from(module({
        name: "elements",
        type: "checkbox",
        choices: choices
    }));
}
function clean(appName, option) {
    console.log(appName);
    //console.log( 'clean ', appName, path.resolve( String(option.excludeDir) ) );
    var excludeDirs = [];
    if (option.excludeDir) {
        excludeDirs = String(option.excludeDir).split(',')
            .map(function (p) { return untildify(p); })
            .map(function (p) { return new RegExp('^' + p); });
    }
    mdfind(appName, excludeDirs)
        //.pipe( tap( print ) )
        .pipe(operators_1.toArray(), operators_1.switchMap(choice))
        .subscribe(function (value) { return console.log(value); }, function (err) { return console.error(err); });
}
program
    .version(_package.version, '-v --version')
    .option("--excludeDir <dir[,dir,...]>", "exclude folder list")
    .arguments('<app name>')
    .action(clean)
    .parse(process.argv);
