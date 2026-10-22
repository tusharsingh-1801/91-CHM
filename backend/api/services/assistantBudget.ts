/** Bounded per-actor AI request budget. In-memory guard complements provider quotas.
 * Multi-instance deployments should use a shared rate limiter at the ingress. */
type Bucket={start:number;count:number;active:number};
export class AssistantBudget {
 private buckets=new Map<string,Bucket>();
 private readonly limit:number;
 private readonly windowMs:number;
 private readonly maxActive:number;
 constructor(limit=8,windowMs=60_000,maxActive=2){this.limit=limit;this.windowMs=windowMs;this.maxActive=maxActive;}
 acquire(key:string,now=Date.now()):{allowed:true;release:()=>void}|{allowed:false;retryAfter:number}{
  if(this.buckets.size>2000)for(const [id,b] of this.buckets)if(now-b.start>this.windowMs&&b.active===0)this.buckets.delete(id);
  let b=this.buckets.get(key);
  if(!b||now-b.start>=this.windowMs){b={start:now,count:0,active:b?.active??0};this.buckets.set(key,b);}
  if(b.count>=this.limit)return {allowed:false,retryAfter:Math.max(1,Math.ceil((this.windowMs-(now-b.start))/1000))};
  if(b.active>=this.maxActive)return {allowed:false,retryAfter:5};
  b.count++;b.active++;
  let released=false;
  return {allowed:true,release:()=>{if(!released){released=true;b!.active=Math.max(0,b!.active-1);}}};
 }
}
export const assistantBudget=new AssistantBudget();
export const configuredKey=(key:string|undefined)=>Boolean(key?.trim()&&!/^(your[-_ ]|placeholder|changeme|replace[-_ ]|example)/i.test(key.trim()));
export const geminiConfigured=()=>configuredKey(process.env.GEMINI_API_KEY);
