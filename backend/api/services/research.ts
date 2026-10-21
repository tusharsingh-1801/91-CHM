import type {Request,Response,NextFunction} from 'express';
import {pool} from '../db/pool.ts';
import {actor} from './auth.ts';

export function requireFieldReviewer(_request:Request,response:Response,next:NextFunction){
 const account=actor(response);
 if(!account){response.status(401).json({error:'Sign in to access research reviews'});return;}
 void pool.query('select 1 from research_role_grants where user_id=$1 and role=$2 and revoked_at is null',[account.id,'field_reviewer'])
  .then(result=>{
   if(!result.rowCount){response.status(403).json({error:'A field reviewer role is required'});return;}
   next();
  },next);
}
