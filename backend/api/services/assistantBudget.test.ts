import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantBudget} from './assistantBudget.ts';

test('Assistant budget allows a limited number of requests per account',()=>{
 const b=new AssistantBudget(2,60000,2);
 const a=b.acquire('user-one',1000),c=b.acquire('user-one',1000);
 assert.equal(a.allowed,true);assert.equal(c.allowed,true);
 assert.deepEqual(b.acquire('user-one',1000),{allowed:false,retryAfter:60});
 if(a.allowed)a.release();if(c.allowed)c.release();
 assert.equal(b.acquire('user-one',61001).allowed,true);
 assert.equal(b.acquire('user-two',1001).allowed,true);
});
test('Assistant budget limits concurrency and release is idempotent',()=>{
 const b=new AssistantBudget(8,60000,1);
 const first=b.acquire('a',100);
 assert.equal(first.allowed,true);
 assert.deepEqual(b.acquire('a',101),{allowed:false,retryAfter:5});
 if(first.allowed){first.release();first.release();}
 assert.equal(b.acquire('a',102).allowed,true);
});
