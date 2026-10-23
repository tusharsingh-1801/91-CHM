import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pool} from '../backend/api/db/pool.ts';
try{
 const fields=(await pool.query('select id,boundary_version,ST_AsGeoJSON(boundary_geom)::jsonb as geometry from fields where boundary_geom is not null order by id')).rows;
 await mkdir('.local/datasets/reference',{recursive:true});
 await writeFile('.local/datasets/reference/pending-field-boundaries.json',JSON.stringify(fields)+'\n');
}finally{await pool.end();}
const child=spawn(process.env.REFERENCE_PYTHON||process.env.PYTHON_BIN||'.venv/bin/python',['scripts/acquire-worldcereal-fields.py'],{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
