/** Explicitly allowlisted, non-identifying research observations; not an export endpoint. */
export type ResearchCase={
 id:string;field_id:string;observed_on:string;observation_category:string|null;
 growth_stage:string|null;severity:string|null;provenance:string;
 verification_status:string;reported_by?:string|null;latitude?:number|null;
 longitude?:number|null;crop?:string|null;symptoms?:string|null;notes?:string|null;
};
export type ResearchRow={
 anonymousCaseId:string;observationMonth:string;
 observationCategory:string;growthStage:string;severity:string;source:'expert_review';
};
/** Consent must be checked by an authorized backend before calling this helper.
 *  ID aliases must be assigned by an independent keyed/pseudonymization mechanism.
 *  The source case ID, field ID, GPS, notes, photos and exact date are NEVER exported.
 */
export function projectVerifiedResearchRows(cases:readonly ResearchCase[],aliasByCaseId:ReadonlyMap<string,string>):ResearchRow[]{
 const seen=new Set<string>();
 return cases.filter(item=>item.provenance==='expert_review'&&item.verification_status==='expert_verified').map(item=>{
  const alias=aliasByCaseId.get(item.id);
  if(!alias||!/^study-[a-z0-9_-]{10,80}$/i.test(alias)||seen.has(alias))throw new Error('Missing or duplicate study alias');
  seen.add(alias);
  if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(item.observed_on)||Number.isNaN(Date.parse(item.observed_on))||new Date(item.observed_on).toISOString().slice(0,10)!==item.observed_on)throw new Error('Invalid observation date');
  return {anonymousCaseId:alias,observationMonth:item.observed_on.slice(0,7),observationCategory:item.observation_category||'unknown',growthStage:item.growth_stage||'unknown',severity:item.severity||'unknown',source:'expert_review' as const};
 });
}
