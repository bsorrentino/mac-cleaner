#!/usr/bin/env node


const  { main } = require('./dist/main')

const _package = require('./package.json');

main( _package.version );
