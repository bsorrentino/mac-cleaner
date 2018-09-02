
import inquirer = require('inquirer');
import chalk from 'chalk';
import program = require('commander');
import { spawn } from 'child_process';
import { stat, Stats } from 'fs';
import path from 'path';

let untildify:(( path:string ) => string) = require('untildify');

import { 
    concat,
    from,
    of,
    fromEvent, 
    Observable, 
    Observer, 
    throwError, 
    bindNodeCallback, 
} from 'rxjs';

import { 
    buffer,
    take,
    takeUntil, 
    map, 
    filter,
    mergeMap, 
    switchMap,
    tap,
    catchError,
    toArray
} from 'rxjs/operators';

let _package = require('./package.json');

type FileInfo = { path:string, stats?:Stats };

function FileInfo( path:string, stats?:Stats ) {
    return { path:path, stats:stats };
}

function mdfind( name:string, excludeDirs:Array<RegExp> ):Observable<FileInfo> {

        const mdfind = spawn( "mdfind", ['-name', name] );

        let onError = fromEvent(mdfind.stderr, "error")
            .pipe( tap( err => console.error( "error", err ) ) )
            .pipe( mergeMap( err => throwError(err )));
        let onClose = fromEvent( mdfind, "close")
            .pipe( tap( (value:any) => console.log( "closed", value[0] ) ));

        let rx_stat = bindNodeCallback( stat );

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

function choice( fileInfo:FileInfo[] ):Observable<any>{

    let module = inquirer.createPromptModule( );

    let choices = fileInfo
            .filter( f => f.stats && (f.stats.isFile() || f.stats.isDirectory()) )
            .map( f => { return { name: f.path } } );

    return from( module( { 
        name:"elements",
        type: "checkbox",
        choices: choices
    })) 
}

function clean( appName:string, option:any ) {

    console.log( appName );

    //console.log( 'clean ', appName, path.resolve( String(option.excludeDir) ) );

    var excludeDirs:Array<RegExp> =  [];

    if( option.excludeDir ) {

        excludeDirs = String(option.excludeDir).split(',')
                            .map( p => untildify(p) )
                            .map( p => { return new RegExp( '^' + p ) });
    }

    mdfind( appName, excludeDirs)
    //.pipe( tap( print ) )
    .pipe( toArray(), switchMap( choice ) )
    .subscribe( 
        value => console.log( value ),
        err => console.error( err)
    );

}

program
    .version(_package.version, '-v --version')
    .option( "--excludeDir <dir[,dir,...]>", "exclude folder list")
    .arguments( '<app name>' )
    .action( clean )
    .parse( process.argv);

