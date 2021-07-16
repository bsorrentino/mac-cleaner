
import inquirer = require('inquirer')
import chalk from 'chalk';
import { exec, spawn } from 'child_process';
import { rmdir, stat, Stats, unlink } from 'fs';
import { bindNodeCallback, EMPTY, from, fromEvent, Observable, of, throwError } from 'rxjs';
import { buffer, catchError, filter, map, mergeMap, switchMap, takeUntil, tap, toArray } from 'rxjs/operators';
import {basename} from 'path'
import program from 'commander';

let untildify:(( path:string ) => string) = require('untildify')

type SearchOptions = {
    excludeDirs:Array<RegExp>
    onlyin?:string
    exact?:boolean
}

type FileInfo = { path:string, stats?:Stats };

const rx_unlink = bindNodeCallback( unlink )
const rx_rmdir = bindNodeCallback( rmdir )
const rx_stat = bindNodeCallback( stat )
const rx_exec = bindNodeCallback( exec )

const sortFileInfo = ( a:FileInfo, b:FileInfo ) => {
    if( a.path < b.path ) return -1;
    if( a.path > b.path ) return 1;
    return 0;
}

/**
 * 
 * @param path 
 * @param stats 
 * @returns 
 */
function FileInfo( path:string, stats?:Stats ) {
    return { path:path, stats:stats };
}

/**
 * 
 * @param name 
 * @param excludeDirs 
 * @returns 
 */
function mdfind( name:string, options:SearchOptions ):Observable<FileInfo> {
        // console.log( 'mdfind', options )

        const { excludeDirs, onlyin, exact } = options
        
        let params = [ '-name', name ]

        if( onlyin ) {
            params.push( '-onlyin', onlyin )
        }

        const mdfind = spawn( 'mdfind', params ) 

        let onError = fromEvent(mdfind.stderr, 'error')
            .pipe( tap( err => console.error( 'error', err ) ) )
            .pipe( mergeMap( err => throwError(err )))

        let onClose = fromEvent( mdfind, 'close')
            //.pipe( tap( (value:any) => console.log( 'closed', value[0] ) ))

        let result =  
            fromEvent( mdfind.stdout, 'data' )
                .pipe(  takeUntil( onError ),
                        takeUntil( onClose ),
                        buffer( onClose ),
                        switchMap( value => from( value.toString().split('\n').sort() ) ))
                    
        if( excludeDirs.length > 0 ) {
            result = result.pipe( filter( p => !excludeDirs.some( pp => p.match( pp )!=null) ))
        }
        
        if( exact ) {
            result = result.pipe( 
                filter( p => basename(p).localeCompare(name, undefined, { sensitivity: 'accent'} )===0 ))
        }

        return result.pipe( 
                    mergeMap( p => rx_stat( p )
                        .pipe(  map( s => FileInfo(p,s) ),
                                catchError( err => of( FileInfo(p) )) )
                    )
                )

}

/**
 * 
 * @param value 
 */
function print( value:FileInfo ) {

    if( !value.stats ) {
        console.log( chalk.red( value.path ))
    }
    else if( value.stats.isFile() )
        console.log( chalk.blueBright( value.path ))
    else if( value.stats.isDirectory() )
        console.log( chalk.cyanBright( value.path ))

}

/**
 * 
 * @param fileInfo 
 * @param pageSize 
 * @returns 
 */
function choice( fileInfo:FileInfo[], pageSize:number ):Observable<any>{

    let module = inquirer.createPromptModule( )

    let choices = fileInfo
            .filter( f => f.stats && (f.stats.isFile() || f.stats.isDirectory()) )
            .map( f => { return { name: f.path, value: f } } )

    return from( module( [{
        name:'elements',
        type: 'checkbox',
        choices: choices,
        pageSize: pageSize
    }]))
}

/**
 * 
 * @param value 
 * @param dryRun 
 * @returns 
 */
function remove( value:FileInfo, dryRun = false ):Observable<FileInfo> {
    if( value.stats ) {
        if( value.stats.isFile() ) {
            console.log( `rm '${value.path}'`)
            if( dryRun ) return EMPTY;
            return rx_unlink( value.path ).pipe( map( v => value ))
        }
        else if( value.stats.isDirectory() ) {
            console.log( `rm -r  '${value.path}'`)
            if( dryRun ) return EMPTY;
            return rx_exec( `rm -r  '${value.path}'` ).pipe( map( v => value ))
        }

    }
    return EMPTY;

}

/**
 * 
 * @param appName 
 * @param option 
 */
function runSearch( appName:string, options:any ) {

    process.stdout.write('\x1Bc')

    console.log( appName )

    //console.log( 'clean ', appName, path.resolve( String(option.excludeDir) ) )

    let excludeDirs:Array<RegExp> =  [];

    if( options.excludeDir ) {

        excludeDirs = String(options.excludeDir).split(',')
                            .map( p => untildify(p) )
                            .map( p => (new RegExp( '^' + p ) ) )
    }

    const msg = () => {
        if( options.dryRun )
            console.log( '#\n# These files should be removed\n#')
        else
            console.log( '#\n# These files have been removed\n#')
    }

     
    mdfind( appName, { excludeDirs:excludeDirs, onlyin:options.onlyin, exact:options.exact } )
            .pipe( toArray(), 
                   filter( files => files.length > 0))
            .pipe( map( files => files.sort( sortFileInfo ) ),
                   switchMap( files => choice(files, Number(options.pageSize)) ),
                   tap( msg ),
                   mergeMap( v => from(v.elements) ),
                   mergeMap( (f:any) => remove(f, options.dryRun ) ))
            .subscribe(
                v => {},
                err => console.error( err),
                () => console.log('\n')
            )

}

/**
 * 
 * @param version 
 */
export function main( version?:string ) {

    const p = program
            .version( version ?? 'unknown', '-v --version')
            .option( '--excludeDir <dir[,dir,...]>', 'exclude folder list')
            .option( '--onlyin <dir>')
            .option( '--dryRun', 'simulate execution (file will non be deleted)')
            .option( '--pageSize <n>', 'number of lines that will be shown per page', '10')
            .option( '--exact', 'match exactly the given name', false)
            .arguments( '<name>' )
            .action( runSearch )

    if (process.argv.slice(2).length == 0) {
            program.outputHelp()
    }
    else {
        p.parse(process.argv)
    }

}

