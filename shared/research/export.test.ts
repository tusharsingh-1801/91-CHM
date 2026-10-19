import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectVerifiedResearchRows,type ResearchCase} from './export.ts';
const base:ResearchCase={id:'case-1',field_id:'private-field',observed_on:'2026-10-19',observation_category:'visual_symptom',growth_stage:'vegetative',severity:'mild',provenance:'expert_review',verification_status:'expert_verified',reported_by:'private-user',latitude:28.3,longitude:77.2,crop:'wheat',symptoms:'Private symptom description',notes:'Private notes'};
test('exports only allowlisted coarse research values, never field IDs, GPS or notes',()=>{
 const rows=projectVerifiedResearchRows([base],new Map([['case-1','study-abcdefghijk']]));
 assert.deepEqual(rows,[{anonymousCaseId:'study-abcdefghijk',observationMonth:'2026-10',observationCategory:'visual_symptom',growthStage:'vegetative',severity:'mild',source:'expert_review'}]);
 const serialized=JSON.stringify(rows);for(const secret of ['private-field','private-user','28.3','77.2','Private notes','wheat','2026-10-19'])assert.equal(serialized.includes(secret),false);
});
test('rejects absent and duplicate study aliases',()=>{
 assert.throws(()=>projectVerifiedResearchRows([base],new Map()));
 assert.throws(()=>projectVerifiedResearchRows([base,{...base,id:'case-2'}],new Map([['case-1','study-abcdefghijk'],['case-2','study-abcdefghijk']])));
});
test('excludes unverified, farmer and synthetic records regardless of misleading status',()=>{
 const items=[{...base,provenance:'owner_reported'},{...base,id:'2',provenance:'synthetic'},{...base,id:'3',verification_status:'unverified'}];
 assert.deepEqual(projectVerifiedResearchRows(items,new Map()),[]);
});
