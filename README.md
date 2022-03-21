# mac-cleaner
A simple macosx utility base on [Spotlight search](https://ss64.com/osx/mdfind.html) to completely remove apps &amp; software

Inspired by [Manual App & Component Removal in OS X via Terminal](http://osxdaily.com/2014/07/31/manual-complete-app-removal-mac-os-x-terminal/#condensed)

## Install

```
$ npm install @bsorrentino/mac-cleaner -g
```

## Usage

```
Usage: mac-cleaner [options] <name>

Options:

  -v --version                  output the version number
  --excludeDir <dir[,dir,...]>  exclude folder list
  --onlyin <dir>                
  --dryRun                      simulate execution (file will non be deleted)
  --pageSize <n>                number of lines that will be shown per page (default: "10")
  --exact                       match exactly the given name (default: false)
  -h, --help                    display help for command

```
