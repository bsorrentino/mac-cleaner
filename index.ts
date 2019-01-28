
import inquirer = require('inquirer');
import chalk from 'chalk';
import { exec, spawn } from 'child_process';
import { rmdir, stat, Stats, unlink } from 'fs';
import { bindNodeCallback, empty, from, fromEvent, Observable, of, throwError } from 'rxjs';
import { buffer, catchError, filter, map, mergeMap, switchMap, takeUntil, tap, toArray } from 'rxjs/operators';

import program from 'commander';

let untildify:(( path:string ) => string) = require('untildify');

let _package = require('./package.json');

type FileInfo = { path:string, stats?:Stats };

const sortFileInfo = ( a:FileInfo, b:FileInfo ) => {
    if( a.path < b.path ) return -1;
    if( a.path > b.path ) return 1;
    return 0;
}

const rx_unlink = bindNodeCallback( unlink );
const rx_rmdir = bindNodeCallback( rmdir );
const rx_stat = bindNodeCallback( stat );
const rx_exec = bindNodeCallback( exec ); 


function FileInfo( path:string, stats?:Stats ) {
    return { path:path, stats:stats };
}

function mdfind( name:string, excludeDirs:Array<RegExp> ):Observable<FileInfo> {

        const mdfind = spawn( "mdfind", ['-name', name] );

        let onError = fromEvent(mdfind.stderr, "error")
            .pipe( tap( err => console.error( "error", err ) ) )
            .pipe( mergeMap( err => throwError(err )));
        let onClose = fromEvent( mdfind, "close")
            //.pipe( tap( (value:any) => console.log( "closed", value[0] ) ));

        return fromEvent( mdfind.stdout, "data")
            .pipe(  takeUntil( onError ), 
                    takeUntil( onClose ),
                    buffer( onClose ),
                    switchMap( value => from( value.toString().split('\n').sort() )),
                    filter( p =>  !excludeDirs.some( pp => p.match( pp )!=null)), 
                    mergeMap( p => rx_stat( p )
                        .pipe(  map( s => FileInfo(p,s) ), 
                                catchError( err => of( FileInfo(p) )) )       
                    )   
                );
 
}

function print( value:FileInfo ) {

    if( !value.stats ) {
        console.log( chalk.red( value.path ))
    }
    else if( value.stats.isFile() )
        console.log( chalk.blueBright( value.path ))  
    else if( value.stats.isDirectory() )
        console.log( chalk.cyanBright( value.path ))  
        
}

function choice( fileInfo:FileInfo[], pageSize:number ):Observable<any>{

    let module = inquirer.createPromptModule( );

    let choices = fileInfo
            .filter( f => f.stats && (f.stats.isFile() || f.stats.isDirectory()) )
            .map( f => { return { name: f.path, value: f } } );

    return from( module( [{ 
        name:"elements",
        type: "checkbox",
        choices: choices,
        pageSize: pageSize
    }])) 
}



function remove( value:FileInfo, dryRun = false ):Observable<FileInfo> {
    if( value.stats ) {
        if( value.stats.isFile() ) {
            console.log( `rm '${value.path}'`);
            if( dryRun ) return empty();
            return rx_unlink( value.path ).pipe( map( v => value ));
        }
        else if( value.stats.isDirectory() ) {
            console.log( `rm -r  '${value.path}'`);
            if( dryRun ) return empty();
            return rx_exec( `rm -r  '${value.path}'` ).pipe( map( v => value ));      
        }

    } 
    return empty();

}
function clean( appName:string, option:any ) {
    
    process.stdout.write('\x1Bc');
    
    console.log( appName );

    //console.log( 'clean ', appName, path.resolve( String(option.excludeDir) ) );

    var excludeDirs:Array<RegExp> =  [];

    if( option.excludeDir ) {

        excludeDirs = String(option.excludeDir).split(',')
                            .map( p => untildify(p) )
                            .map( p => { return new RegExp( '^' + p ) });
    }

    const msg = () => {
        if( option.dryRun ) 
            console.log( "#\n# These files should be removed\n#");
        else 
            console.log( "#\n# These files have been removed\n#");
    }

    mdfind( appName, excludeDirs)
    .pipe( toArray(), 
        map( files => files.sort( sortFileInfo ) ), 
        switchMap( files => choice(files, Number(option.pageSize)) ) )
    .pipe( tap( msg ) )
    .pipe( mergeMap( v => from(v.elements) ))
    .pipe( mergeMap( f => remove(f, option.dryRun ) ) )
    .subscribe( 
        v => {},
        err => console.error( err),
        () => console.log('\n')
    );

}

program
    .version(_package.version, '-v --version')
    .option( "--excludeDir <dir[,dir,...]>", "exclude folder list")
    .option( "--dryRun", "simulate execution (file will non be deleted)")
    .option( "--pageSize <n>", "number of lines that will be shown per page", 10)
    .arguments( '<app name>' )
    .action( clean )
    .parse( process.argv);

if (!process.argv.slice(2).length) {
        program.outputHelp();
}