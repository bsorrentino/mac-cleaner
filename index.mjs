#!/usr/bin/env node

import 'zx/globals'
import  { main } from './dist/main.js'

import {fileURLToPath} from 'url';

// https://bobbyhadz.com/blog/javascript-dirname-is-not-defined-in-es-module-scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// console.log( __dirname)

fs.readFile( path.join(__dirname, 'package.json')  )
    .then( pkg => JSON.parse(pkg.toString()) )
    .then( pkg => main( pkg.version ))
    .catch( e => { 
        console.error( 'error rieading package.json', e.message ) ; 
        main('') 
    })

