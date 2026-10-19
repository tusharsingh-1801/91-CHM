import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBinary,assertFieldDisjoint,type LabelledInspection} from './metrics.ts';
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
