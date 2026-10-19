import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBinary,assertFieldDisjoint,type LabelledInspection,evaluateReviewedInspections} from './metrics.ts';
const row=(fieldId:string,actual:boolean,predicted:boolean,verified=true):LabelledInspection=>({fieldId,actual,predicted,verified,observedOn:'2026-10-19'});
test('evaluates only independently verified inspections',()=>{
 const result=evaluateBinary([row('a',true,true),row('b',false,false),row('c',false,true),row('d',true,false),row('e',true,true,false)]);
 assert.deepEqual([result.evaluated,result.tp,result.tn,result.fp,result.fn],[4,1,1,1,1]);
 assert.equal(result.precision,0.5);assert.equal(result.recall,0.5);assert.equal(result.f1,0.5);assert.equal(result.falseAlertRate,0.5);
});
test('returns null rather than inventing metrics when no verified data exist',()=>{const r=evaluateBinary([]);assert.equal(r.evaluated,0);assert.equal(r.accuracy,null);assert.equal(r.f1,null);});
test('returns undefined precision and specificity with zero denominators',()=>{const r=evaluateBinary([row('a',true,false)]);assert.equal(r.precision,null);assert.equal(r.specificity,null);assert.equal(r.recall,0);});
test('rejects invalid verified observations',()=>assert.throws(()=>evaluateBinary([row('',true,true)])));
test('prevents field leakage even when dates differ',()=>{assert.throws(()=>assertFieldDisjoint([{fieldId:'field-A'}],[{fieldId:'field-A'}]));assert.doesNotThrow(()=>assertFieldDisjoint([{fieldId:'field-A'}],[{fieldId:'field-B'}]));});

test('does not treat owner or synthetic records as independent expert ground truth',()=>{
 const base={fieldId:'field-a',observedOn:'2026-10-19',actual:true,predicted:true,reviewStatus:'expert_verified' as const,reviewerId:'expert-1',reviewedAt:'2026-10-19T10:00:00Z'};
 const result=evaluateReviewedInspections([
  {...base,provenance:'owner_reported'}, {...base,provenance:'synthetic'}, {...base,provenance:'expert_review',reviewerId:''},{...base,provenance:'expert_review'}
 ]);
 assert.equal(result.evaluated,1);
 assert.equal(result.tp,1);
});
test('field split guard rejects missing field IDs in training split',()=>{
 assert.throws(()=>assertFieldDisjoint([{fieldId:''}],[{fieldId:'valid'}]));
});
