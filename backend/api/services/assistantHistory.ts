import {geminiConfigured} from './assistantBudget.ts';
import type {Request,Response} from 'express';import {pool} from '../db/pool.ts';import {actor} from './auth.ts';
let lastSuccessAt:string|null=null;
export function recordAssistantSuccess(){lastSuccessAt=new Date().toISOString();}
export async function assistantAvailability(_request:Request,response:Response){
 if(!actor(response)){response.status(401).json({error:'Sign in to view provider status'});return;}
 response.json({configured:geminiConfigured(),provider:'gemini',model:process.env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite',history:true,lastSuccessAt,availability:'Configuration only; availability is checked on send'});
}
export async function assistantHistory(request:Request,response:Response){
 const account=actor(response);if(!account){response.json([]);return;}
 const fieldId=request.query.fieldId;
 if(fieldId!==undefined&&(typeof fieldId!=='string'||!/^[-a-f0-9]{36}$/i.test(fieldId))){response.status(400).json({error:'Use a valid field id'});return;}
 if(fieldId&&!(await pool.query('select id from fields where id=$1 and owner_id=$2',[fieldId,account.id])).rowCount){response.status(404).json({error:'Field not found'});return;}
 response.json((await pool.query('select role,content,created_at from (select role,content,created_at,position from assistant_messages where owner_id=$1 and field_id is not distinct from $2::uuid order by created_at desc,position desc limit 30) history order by created_at,position',[account.id,fieldId||null])).rows);
}
export async function deleteAssistantHistory(_request:Request,response:Response){const account=actor(response);if(!account){response.status(401).json({error:'Sign in to clear saved conversations'});return;}await pool.query('delete from assistant_messages where owner_id=$1',[account.id]);response.json({ok:true});}
