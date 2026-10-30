#!/usr/bin/env node
// Non-destructive local validation; creates evidence logs under ignored .local/.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const options=new Set(process.argv.slice(2));
const dir=resolve(root,'.local','submission-evidence',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(dir,{recursive:true});
function check(name,cmd,args,validateOutput=()=>true){
 const started=new Date().toISOString();
 const options={cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,timeout:720000,env:process.env};
 const result=process.platform==='win32'&&cmd==='npm'
  ? spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',['npm',...args].join(' ')],options)
  : spawnSync(cmd,args,options);
 const log=resolve(dir,name+'.log');
 writeFileSync(log,(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:''),{mode:0o600});
 const status=result.status===0&&validateOutput(result.stdout||'')?'passed':'failed';
 console.log(status.toUpperCase(),name);
 return {name,status,started,ended:new Date().toISOString(),exitCode:result.status,signal:result.signal||null,error:result.error?.message||null,log};
}
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
const results=[
 check('build','npm',['run','build']),
 check('lint','npm',['run','lint']),
 check('node-tests','npm',['test']),
 check('photo-storage-tests','npm',['run','photos:test']),
 check('database-integration','npm',['run','test:integration']),
 check('python-tests',process.env.PYTHON_BIN || (process.platform==='win32' ? (existsSync(resolve(root,'.venv','Scripts','python.exe')) ? resolve(root,'.venv','Scripts','python.exe') : 'python') : (existsSync(resolve(root,'.venv','bin','python')) ? resolve(root,'.venv','bin','python') : 'python3')),['-m','pytest','backend/engine','-q'])
];
if(!options.has('--skip-ui'))results.push(check('browser-tests','npm',['run','test:ui']));
if(options.has('--smoke')){
 const status=check('stack-status','npm',['run','status'],output=>/^Services: healthy\s*$/m.test(output));results.push(status);
 if(status.status==='passed')results.push(check('smoke','npm',['run','test:smoke']));
 else {
  const log=resolve(dir,'smoke.log');
  writeFileSync(log,'SKIPPED: Local stack is not healthy. Start the services and check stack-status.log before re-running the smoke test.\n',{mode:0o600});
  results.push({name:'smoke',status:'skipped',reason:'stack-unhealthy',started:null,ended:null,exitCode:null,log});
  console.log('SKIPPED smoke (stack unhealthy)');
 }
}
const dirtyAfter=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
const headAfter=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const cleanCheckout=git.status===0&&headAfter.status===0&&git.stdout.trim()===headAfter.stdout.trim()&&dirty.status===0&&dirty.stdout.trim()===''&&dirtyAfter.status===0&&dirtyAfter.stdout.trim()==='';
const allChecksPassed=results.every(item=>item.status==='passed');
const fullDemoChecksRequested=!options.has('--skip-ui')&&options.has('--smoke');
const exhibitionChecksPassed=fullDemoChecksRequested&&results.some(item=>item.name==='browser-tests'&&item.status==='passed')&&results.some(item=>item.name==='smoke'&&item.status==='passed');
const summary={
 validationScope:fullDemoChecksRequested?'automated-demo-checks':'partial',
 automatedDemoChecksPassed:allChecksPassed&&cleanCheckout&&exhibitionChecksPassed,
 exhibitionDemoVerified:false,
 manualVerificationRequired:['Real satellite imagery acceptance and crop-health accuracy','Farmer-facing usability walkthrough','Faculty exhibition demo and approval'],
 missingDemoChecks:[...(!options.has('--smoke')?['live-smoke-not-requested']:[]),...(options.has('--skip-ui')?['browser-tests-skipped']:[])],
 failedChecks:results.filter(item=>item.status!=='passed').map(item=>({name:item.name,status:item.status,log:item.log,reason:item.reason||item.error||null})),
 overallStatus:allChecksPassed&&cleanCheckout?'passed':'failed',
 readinessNote:!cleanCheckout?'Evidence requires a clean Git checkout with a known commit.':undefined,
 generatedAt:new Date().toISOString(),
 commit:git.status===0?git.stdout.trim():null,
 worktreeClean:dirtyAfter.status===0?dirtyAfter.stdout.trim()==='':null,
 worktreeCleanBefore:dirty.status===0?dirty.stdout.trim()==='':null,
 commitUnchanged:git.status===0&&headAfter.status===0?git.stdout.trim()===headAfter.stdout.trim():null,
 environment:{platform:process.platform,arch:process.arch,node:process.version},
 limitations:['Browser tests mock API and map tiles; passing does not establish live satellite acceptance.','Satellite accuracy, field validation, human usability and faculty approval remain independent requirements.'],
 results
};
writeFileSync(resolve(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log('Submission evidence:',dir);
console.log('Checks passed:',results.filter(x=>x.status==='passed').length+'/'+results.length);
if(!allChecksPassed||!cleanCheckout)process.exitCode=1;
