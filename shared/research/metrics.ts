/** Deterministic binary evaluation utilities. No medical/agronomic accuracy claim. */
export type LabelledInspection={fieldId:string; observedOn:string;actual:boolean;predicted:boolean;verified:boolean};
export type BinaryMetrics={evaluated:number;tp:number;tn:number;fp:number;fn:number;precision:number|null;recall:number|null;specificity:number|null;f1:number|null;accuracy:number|null;falseAlertRate:number|null};
const ratio=(n:number,d:number):number|null=>d===0?null:n/d;
export function evaluateBinary(rows:readonly LabelledInspection[]):BinaryMetrics {
 const verified=rows.filter(r=>r.verified);
 if(verified.some(r=>!r.fieldId||!/^\d{4}-\d{2}-\d{2}$/.test(r.observedOn)||typeof r.actual!=='boolean'||typeof r.predicted!=='boolean'))throw new Error('Invalid verified inspection');
 const tp=verified.filter(r=>r.actual&&r.predicted).length;
 const tn=verified.filter(r=>!r.actual&&!r.predicted).length;
 const fp=verified.filter(r=>!r.actual&&r.predicted).length;
 const fn=verified.filter(r=>r.actual&&!r.predicted).length;
 const precision=ratio(tp,tp+fp),recall=ratio(tp,tp+fn);
 return {evaluated:verified.length,tp,tn,fp,fn,precision,recall,specificity:ratio(tn,tn+fp),f1:precision===null||recall===null||precision+recall===0?null:2*precision*recall/(precision+recall),accuracy:ratio(tp+tn,verified.length),falseAlertRate:ratio(fp,fp+tn)};
}
/** Assert independent field groups across training and held-out evaluation. */
export function assertFieldDisjoint(train:readonly Pick<LabelledInspection,'fieldId'>[],test:readonly Pick<LabelledInspection,'fieldId'>[]):void{
 const trainIds=new Set(train.map(r=>r.fieldId));
 if(trainIds.has('')||train.some(r=>!r.fieldId)||test.some(r=>!r.fieldId||trainIds.has(r.fieldId)))throw new Error('Field leakage or invalid field ID detected');
}

/**
 * Research-only adapter. The caller MUST load review records from an authorized
 * server-side query, not from editable farmer/client JSON.
 */
export type ReviewedInspection={
 fieldId:string;observedOn:string;actual:boolean;predicted:boolean;
 provenance:'owner_reported'|'expert_review'|'synthetic';
 reviewStatus:'unverified'|'expert_verified'|'rejected';
 reviewerId:string|null;reviewedAt:string|null;
};
export function toEvaluableInspections(records:readonly ReviewedInspection[]):LabelledInspection[]{
 return records.map(record=>{
  const verified=record.provenance==='expert_review'&&record.reviewStatus==='expert_verified'&&
   typeof record.reviewerId==='string'&&record.reviewerId.trim().length>0&&
   typeof record.reviewedAt==='string'&&!Number.isNaN(Date.parse(record.reviewedAt));
  return {fieldId:record.fieldId,observedOn:record.observedOn,actual:record.actual,predicted:record.predicted,verified};
 });
}
export function evaluateReviewedInspections(records:readonly ReviewedInspection[]):BinaryMetrics{
 return evaluateBinary(toEvaluableInspections(records));
}
