import {test,expect} from '@playwright/test';
import {setup} from './fixtures';

test('local profile personalizes the greeting, persists changes and restores the default when name is blank',async({page})=>{
 await setup(page);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Hello, Farmer!',exact:true})).toBeVisible();
 await page.getByLabel('Your account',{exact:true}).click();
 await expect(page).toHaveURL(/\/profile$/);
 await page.getByLabel('Full name',{exact:true}).fill('Tushar Singh');
 await page.getByLabel('Phone number',{exact:true}).fill('+91 98765 43210');
 await page.getByLabel('Farm name',{exact:true}).fill('Sunrise Farm');
 await page.getByLabel('Village / city / state',{exact:true}).fill('Pune, Maharashtra');
 await page.getByLabel('About your farm',{exact:true}).fill('Wheat and maize with drip irrigation.');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Profile saved');
 await page.reload();
 await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Tushar Singh');
 await page.getByRole('link',{name:'Back to dashboard'}).click();
 await expect(page.getByRole('heading',{name:'Hello, Tushar Singh!',exact:true})).toBeVisible();
 await page.getByLabel('Your account',{exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('Discard this');
 await page.getByRole('button',{name:'Cancel changes',exact:true}).click();
 await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Tushar Singh');
 await page.getByLabel('Full name',{exact:true}).fill('');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Profile saved');
 await page.getByRole('link',{name:'Back to dashboard'}).click();
 await expect(page.getByRole('heading',{name:'Hello, Farmer!',exact:true})).toBeVisible();
});

test('profile reports save failures and validates passwords without losing entered details',async({page})=>{
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{mode:'required',user:{id:'profile-user',email:'farmer@example.invalid',profile:{name:'Asha'}}}});
  if(path==='/api/auth/profile')return route.fulfill({status:503,json:{error:'Profile service unavailable'}});
  if(path==='/api/auth/password')return route.fulfill({status:400,json:{error:'Current password is incorrect'}});
  return route.fulfill({json:[]});
 });
 await page.goto('/profile');
 await page.getByLabel('Full name',{exact:true}).fill('Asha Patel');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Profile service unavailable');
 await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Asha Patel');
 await page.getByLabel('Current password',{exact:true}).fill('old-password-test');
 await page.getByLabel('New password',{exact:true}).fill('new-password-test');
 await page.getByLabel('Confirm new password',{exact:true}).fill('different-password');
 await page.getByRole('button',{name:'Change password',exact:true}).click();
 await expect(page.getByText('New passwords do not match.',{exact:true})).toBeVisible();
 await page.getByLabel('Confirm new password',{exact:true}).fill('new-password-test');
 await page.getByRole('button',{name:'Change password',exact:true}).click();
 await expect(page.getByText('Current password is incorrect',{exact:true})).toBeVisible();
 await page.setViewportSize({width:320,height:568});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('profile-mobile.png'),fullPage:true});
});

test('registration name becomes the greeting immediately after sign-in',async({page})=>{
 let signedIn=false;let name='';
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{mode:'required',user:signedIn?{id:'new-user',email:'nisha@example.invalid',profile:{name}}:null}});
  if(path==='/api/auth/register'){name=route.request().postDataJSON().name;signedIn=true;return route.fulfill({json:{user:{id:'new-user',email:'nisha@example.invalid',profile:{name}}}});}
  return route.fulfill({json:[]});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'New to TerraScope? Create an account'}).click();
 await page.getByLabel('Your name (optional)',{exact:true}).fill('Nisha');
 await page.getByLabel('Email',{exact:true}).fill('nisha@example.invalid');
 await page.getByLabel('Password',{exact:true}).fill('a-long-new-password');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hello, Nisha!',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Hello, Nisha!',exact:true})).toBeVisible();
});
