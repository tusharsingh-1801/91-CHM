import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import type {Request,Response,NextFunction} from 'express';
import {Router} from 'express';
import {pool} from '../db/pool.ts';
import {validateProfile,type ProfileValues} from '../../../shared/profile.ts';
const scrypt=promisify(scryptCallback);
export interface Account{id:string;email:string;profile?:ProfileValues}
export const authRequired=()=>process.env.AUTH_MODE!=='local';
export function actor(response:Response):Account|null{return response.locals?.account as Account|null??null;}
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64) as Buffer).toString('hex');}
export async function verifyPassword(password:string,stored:string){const [salt,hex]=stored.split(':');const key=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');return expected.length===key.length&&timingSafeEqual(key,expected);}
const cookieName='chm_session';
function token(request:Request){const match=request.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='));return match?.slice(cookieName.length+1)||'';}
export async function session(request:Request,response:Response,next:NextFunction){
 response.locals.account=null;
 try{const value=token(request);if(/^[a-f0-9]{64}$/.test(value)){const result=await pool.query<Account>(`select u.id,u.email,u.profile from app_sessions s join app_users u on u.id=s.user_id where token_hash=$1 and expires_at>now()`,[hashToken(value)]);response.locals.account=result.rows[0]??null;}next();}
 catch(error){next(error);}
}
export function requireAccount(_request:Request,response:Response,next:NextFunction){if(authRequired()&&!actor(response)){response.status(401).json({error:'Sign in to access your fields'});return;}next();}
export async function requireField(request:Request,response:Response,next:NextFunction){
 if(!authRequired()){next();return;}
 const id=request.params.fieldId||(request.body as {fieldId?:string}|undefined)?.fieldId;
 if(!id){next();return;}
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){response.status(400).json({error:'fieldId must be a valid UUID'});return;}
 try{const result=await pool.query('select id from fields where id=$1 and owner_id=$2',[id,actor(response)?.id]);if(!result.rowCount){response.status(404).json({error:'Field not found'});return;}next();}catch(error){next(error);}
}
export function sameOrigin(request:Request,response:Response,next:NextFunction){
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  const origin=request.get('origin');
  if(origin){const allowed=(process.env.APP_ORIGIN||'').split(',').filter(Boolean);try{
   const url=new URL(origin);
   const loopback=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname);
   const allowedDevelopmentOrigin=process.env.NODE_ENV!=='production'&&loopback(url.hostname)&&loopback(request.hostname);
   if(!allowed.includes(origin)&&url.host!==request.get('host')&&!allowedDevelopmentOrigin){response.status(403).json({error:'Request origin is not allowed'});return;}
  }catch{response.status(403).json({error:'Invalid origin'});return;}}
 }
 response.setHeader('Cache-Control','no-store');next();
}
export const authRouter=Router();
authRouter.get('/session',(_req,res)=>res.json({mode:authRequired()?'required':'local',user:actor(res)}));

authRouter.post('/logout',async(req,res)=>{await pool.query('delete from app_sessions where token_hash=$1',[hashToken(token(req))]);res.clearCookie(cookieName,{path:'/api'});res.json({ok:true});});
for(const action of ['register','login'] as const)authRouter.post('/'+action,async(req,res)=>{
 const {email,password,name}=(req.body ?? {}) as {email?:unknown;password?:unknown;name?:unknown};
 if(action==='register'&&name!==undefined&&(typeof name!=='string'||name.trim().length>60)){res.status(400).json({error:'Name must be under 60 characters'});return;}
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>160||typeof password!=='string'||password.length<12||password.length>256){res.status(400).json({error:'Use a valid email and a password of 12–256 characters'});return;}
 try{
  const key=hashToken((req.ip||'local')+':'+email.toLowerCase());
  const limit=await pool.query<{attempts:number}>(`insert into auth_limits(key,attempts) values($1,1) on conflict(key) do update set attempts=case when auth_limits.window_start<now()-interval '15 minutes' then 1 else auth_limits.attempts+1 end,window_start=case when auth_limits.window_start<now()-interval '15 minutes' then now() else auth_limits.window_start end returning attempts`,[key]);
  if(limit.rows[0].attempts>10){res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});return;}
  let account:Account|undefined;
  if(action==='register'){
   const result=await pool.query<Account>('insert into app_users(email,password_hash,profile) values($1,$2,$3) on conflict(email) do nothing returning id,email,profile',[email.trim().toLowerCase(),await hashPassword(password),JSON.stringify(validateProfile({name}))]);account=result.rows[0];
   if(!account){res.status(409).json({error:'Account already exists. Sign in instead.'});return;}
  }else{
   const result=await pool.query<Account&{password_hash:string}>('select * from app_users where email=$1',[email.trim().toLowerCase()]);const user=result.rows[0];
   // Perform the expensive check even for an unknown email.
   const valid=await verifyPassword(password,user?.password_hash||'00000000000000000000000000000000:'+ '00'.repeat(64));
   if(!user||!valid){res.status(401).json({error:'Email or password is incorrect'});return;}account=user;
  }
  const value=randomBytes(32).toString('hex');await pool.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')",[hashToken(value),account.id]);
  res.cookie(cookieName,value,{httpOnly:true,sameSite:'strict',secure:process.env.AUTH_SECURE_COOKIE==='1'||process.env.NODE_ENV==='production',path:'/api',maxAge:7*86400000});
  res.json({user:{id:account.id,email:account.email,profile:account.profile}});
 }catch {console.error('Authentication unavailable');res.status(503).json({error:'Sign-in service unavailable. Retry shortly.'});}
});

authRouter.patch('/profile',async(req,res)=>{
 const account=actor(res);if(!account){res.status(401).json({error:'Sign in to edit your profile'});return;}
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){res.status(400).json({error:'Enter valid profile details'});return;}
 let profile:ProfileValues;
 try{profile=validateProfile({...account.profile,...req.body});}catch(error){res.status(400).json({error:(error as Error).message});return;}
 const result=await pool.query<Account>('update app_users set profile=$1 where id=$2 returning id,email,profile',[JSON.stringify(profile),account.id]);
 if(!result.rows[0]){res.status(404).json({error:'Account not found'});return;}res.json({user:result.rows[0]});
});
authRouter.post('/password',async(req,res)=>{
 const account=actor(res);if(!account){res.status(401).json({error:'Sign in to change your password'});return;}
 const {currentPassword,newPassword}=req.body??{};
 if(typeof currentPassword!=='string'||currentPassword.length>256||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>256||currentPassword===newPassword){res.status(400).json({error:'Use a different new password of 12–256 characters'});return;}
 const key=hashToken('password:'+account.id);
 const limit=await pool.query<{attempts:number}>(`insert into auth_limits(key,attempts) values($1,1) on conflict(key) do update set attempts=case when auth_limits.window_start<now()-interval '15 minutes' then 1 else auth_limits.attempts+1 end,window_start=case when auth_limits.window_start<now()-interval '15 minutes' then now() else auth_limits.window_start end returning attempts`,[key]);
 if(limit.rows[0].attempts>5){res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});return;}
 const stored=(await pool.query<{password_hash:string}>('select password_hash from app_users where id=$1',[account.id])).rows[0]?.password_hash;
 if(!stored||!await verifyPassword(currentPassword,stored)){res.status(400).json({error:'Current password is incorrect'});return;}
 const hashed=await hashPassword(newPassword);
 const client=await pool.connect();
 try{
  await client.query('begin');
  const updated=await client.query('update app_users set password_hash=$1 where id=$2 and password_hash=$3 returning id',[hashed,account.id,stored]);
  if(!updated.rowCount){await client.query('rollback');res.status(409).json({error:'Password changed elsewhere. Sign in again.'});return;}
  await client.query('delete from app_sessions where user_id=$1 and token_hash<>$2',[account.id,hashToken(token(req))]);
  await client.query('commit');res.json({ok:true});
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
});
