import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const services=resolve(root,'backend/api/services');
const testFiles=readdirSync(services,{withFileTypes:true})
 .filter(entry=>entry.isFile()&&entry.name.endsWith('.integration.test.ts'))
 .map(entry=>resolve(services,entry.name))
 .sort();

if(testFiles.length===0)throw new Error(`No integration tests found in ${services}`);

const result=spawnSync(process.execPath,['--import','tsx','--test',...testFiles],{
 cwd:root,
 env:{...process.env,CHM_INTEGRATION:'1'},
 stdio:'inherit',
});

if(result.error){
 console.error(`Unable to start integration tests: ${result.error.message}`);
 process.exitCode=1;
}else if(result.signal){
 console.error(`Integration tests terminated by ${result.signal}.`);
 process.exitCode=1;
}else{
 process.exitCode=result.status??1;
}
