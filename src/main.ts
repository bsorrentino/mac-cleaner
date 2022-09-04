
import 'zx/globals'
import inquirer, { Answers } from 'inquirer';
import { Stats } from 'fs';
import { EMPTY, from, Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators/index.js';
import {basename} from 'path'
import { Command } from 'commander';
import untildify from 'untildify'


type SearchOptions = {
    excludeDirs:Array<RegExp>
    onlyin?:string
    exact?:boolean
}

type FileInfo = { path:string, stats?:Stats };

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
 * @param options 
 */

function mdFindAsync( name:string, options:SearchOptions ) {
    const { excludeDirs, onlyin, exact } = options
        
    let params = [ '-name', name ]

    if( onlyin ) {
        params.push( '-onlyin', onlyin )
    }

    async function* fetchResult () {

        $.verbose = false 

        const { stderr, stdout } = await $`mdfind ${params}`

        const predicate_true = ( _:string ) => true 

        const isLineValid = ( line:string ) => line && line.trim().length > 0
    
        const excludeDirFilter =  excludeDirs.length > 0 ? 
                                      ( line:string ) =>   !excludeDirs.some( pp => line.match( pp )!=null) :
                                      predicate_true ;
        
        const exactFilter = (exact) ? 
                                (line:string) => basename(line).localeCompare(name, undefined, { sensitivity: 'accent'} )===0 :
                                predicate_true ;    

        const lines = stdout.split('\n')
            .filter( isLineValid )
            .filter( excludeDirFilter )
            .filter( exactFilter )

        for ( const line of lines) {

            const stat = await fs.stat( line ) 
            yield FileInfo( line, stat )

        } 
    }
         
    return { 
        [Symbol.asyncIterator]: () => fetchResult()
    }
}

/**
 * 
 * @param fileInfo 
 * @param pageSize 
 * @returns 
 */
 function makeChoices( fileInfo:FileInfo[], pageSize:number ):Observable<Answers>{

    const module = inquirer.createPromptModule( )

    const choices = fileInfo
            .map( f => ( { name: f.path, value: f } ))

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
 * @param file 
 * @param dryRun 
 * @returns 
 */
function remove( file:FileInfo, dryRun = false ):Observable<FileInfo> {
    if( file.stats ) {
        if( file.stats.isFile() ) {
            console.log( `rm '${file.path}'`)
        }
        else if( file.stats.isDirectory() ) {
            console.log( `rm -r  '${file.path}'`)
        }
        if( !dryRun ) {
            from(fs.remove( file.path )).pipe( map( v => file ))
        }
    }
    return EMPTY;

}

/**
 * 
 * @param version 
 */
export function main( version?:string ) {
    const program = new Command()

    const p = program
            .version( version ?? 'unknown', '-v --version')
            .option( '--excludeDir <dir[,dir,...]>', 'exclude folder list')
            .option( '--onlyin <dir>', 'search exclusively in <dir>')
            .option( '--dryRun', 'simulate execution (file will non be deleted)')
            .option( '--pageSize <n>', 'number of lines that will be shown per page', '10')
            .option( '--exact', 'match exactly the given name', false)
            .arguments( '<name>' )
            .action( runSearchAsync )

    if (process.argv.slice(2).length == 0) {
            program.outputHelp()
    }
    else {
        p.parse(process.argv)
    }

}

async function runSearchAsync( appName:string, options:any ) {

    process.stdout.write('\x1Bc')
    
    console.log( `${chalk.underline('Search for:')} ${chalk.blueBright.bold(appName)}`)

    let excludeDirs:Array<RegExp> =  [];

    if( options.excludeDir ) {

        excludeDirs = String(options.excludeDir).split(',')
                            .map( p => untildify(p) )
                            .map( p => (new RegExp( '^' + p ) ) )
    }

    const files = Array<FileInfo>()

    for await (const f of mdFindAsync( appName, {
        excludeDirs:excludeDirs, 
        onlyin:options.onlyin, 
        exact:options.exact
    })) {
        
        if( f.stats?.isFile() || f.stats?.isDirectory()) {
            files.push( f )
        }
    }
    
    console.log( `\n${chalk.red.bold('Selected files will be removed')}\n`)

    makeChoices( files.sort( sortFileInfo ), Number(options.pageSize) )
        .pipe(
            mergeMap( v => from(v.elements) ),
            mergeMap( (f:any) => remove(f, options.dryRun ) ))
            .subscribe(
                v => {},
                err => console.error( err),
                () => console.log('\n')
            )

}
