import {test,expect} from '@playwright/test';
import { setup, id, openMenu } from './fixtures';
test('Gemini is the only provider, sends requests and preserves failed drafts',async({page})=>{
 await setup(page);
 await page.route('**/api/auth/session',route=>route.fulfill({json:{mode:'required',user:{id:'test-user',email:'test@example.invalid'}}}));
 await page.route('**/api/assistant/status',route=>route.fulfill({json:{configured:true,provider:'gemini'}}));
 let failure=false;const bodies:any[]=[];
 await page.route('**/api/assistant',route=>{bodies.push(route.request().postDataJSON());return route.fulfill({status:failure?503:200,json:failure?{error:'Gemini temporarily unavailable.'}:{answer:'Gemini fixture answer',historySaved:false}});});
 await page.goto('/help');await page.getByRole('button',{name:'Ask crop assistant'}).click();
 const panel=page.getByRole('region',{name:'Crop assistant chat'});
 await expect(panel).toContainText('Gemini AI');await expect(page.getByLabel('AI Provider')).toHaveCount(0);
 await expect(panel.getByLabel('Save conversation history')).toBeVisible();
 await page.getByLabel('Your question').fill('Crop question');await page.getByRole('button',{name:'Send question'}).click();
 await expect(panel).toContainText('Gemini fixture answer');expect(bodies[0].provider).toBe('gemini');
 failure=true;await page.getByLabel('Your question').fill('Retry this question');await page.getByRole('button',{name:'Send question'}).click();
 await expect(panel.getByRole('alert')).toContainText('temporarily unavailable');await expect(page.getByLabel('Your question')).toHaveValue('Retry this question');
 await expect(panel.locator('.assistant-user-message').filter({hasText:'Retry this question'})).toHaveCount(0);
 failure=false;await page.getByRole('button',{name:'Send question'}).click();
 await expect(panel).toContainText('Gemini fixture answer');
 await expect(panel.locator('.assistant-user-message').filter({hasText:'Retry this question'})).toHaveCount(1);
 expect(bodies).toHaveLength(3);
});
test('rapid duplicate submits send and display a question only once',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 await page.route('**/api/assistant',async route=>{calls++;await gate;await route.fulfill({json:{answer:'One reply'}});});
 await page.goto('/');await page.getByRole('button',{name:'Ask crop assistant'}).click();
 const panel=page.getByRole('region',{name:'Crop assistant chat'});
 await page.getByLabel('Your question').fill('Send this once');
 await page.getByLabel('Your question').evaluate(element=>{const form=element.closest('form');if(!(form instanceof HTMLFormElement))throw new Error('Assistant form missing');form.requestSubmit();form.requestSubmit();});
 await expect.poll(()=>calls).toBe(1);
 release();
 await expect(panel.locator('.assistant-user-message').filter({hasText:'Send this once'})).toHaveCount(1);
 await expect(panel).toContainText('One reply');
});
test('late replies stay in their original field conversation',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/assistant',async route=>{await gate;await route.fulfill({json:{answer:'Original general reply'}});});
 // The dashboard has its own inline chat, so the floating assistant is opened from Help and kept open while navigating.
 await page.goto('/help');await page.getByRole('button',{name:'Ask crop assistant'}).click();await page.getByLabel('Your question').fill('General question');await page.getByRole('button',{name:'Send question'}).click();
 await expect(page.getByRole('button',{name:'Send question'})).toBeDisabled();
 await openMenu(page);await page.getByRole('link',{name:'Dashboard',exact:true}).click();
 await page.locator('.fh-field',{hasText:'Test field'}).first().click();await expect(page).toHaveURL(new RegExp(id));release();
 const panel=page.getByRole('region',{name:'Crop assistant chat'});await expect(panel).not.toContainText('Original general reply');await expect(panel).not.toContainText('General question');
});

test('a busy Gemini offers one-click "Try again"; content errors do not', async ({ page }) => {
  await setup(page);
  await page.route('**/api/auth/session', route => route.fulfill({ json: { mode: 'required', user: { id: 'test-user', email: 'test@example.invalid' } } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { configured: true, provider: 'gemini' } }));
  const questions: string[] = []; let mode: 'busy' | 'blocked' | 'ok' = 'busy';
  await page.route('**/api/assistant', route => {
    questions.push(route.request().postDataJSON().message);
    if (mode === 'busy') return route.fulfill({ status: 502, json: { error: 'Gemini is busy right now. Please try again in a moment.', code: 'provider_unavailable' } });
    if (mode === 'blocked') return route.fulfill({ status: 502, json: { error: 'Gemini could not answer this question. Please rephrase it.', code: 'blocked' } });
    return route.fulfill({ json: { answer: 'Second try worked', historySaved: false } });
  });
  await page.goto('/help'); await page.getByRole('button', { name: 'Ask crop assistant' }).click();
  const panel = page.getByRole('region', { name: 'Crop assistant chat' });
  await page.getByLabel('Your question').fill('Why is my crop pale?'); await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByRole('alert')).toContainText('Gemini is busy right now');
  const retry = panel.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();

  mode = 'ok'; await retry.click();
  await expect(panel).toContainText('Second try worked');
  await expect(panel.getByRole('button', { name: 'Try again' })).toHaveCount(0);        // gone after success
  expect(questions).toEqual(['Why is my crop pale?', 'Why is my crop pale?']);          // the same question, not a new one

  mode = 'blocked';
  await page.getByLabel('Your question').fill('Something else'); await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByRole('alert')).toContainText('rephrase');
  await expect(panel.getByRole('button', { name: 'Try again' })).toHaveCount(0);        // retrying a blocked question is pointless
});
