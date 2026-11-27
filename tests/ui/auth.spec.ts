import {expect,test} from '@playwright/test';
import { openMenu, closeMenu } from './fixtures';

test.use({baseURL:'http://127.0.0.1:5175'});

test('account gate keeps field screens behind sign-in and supports sign-out',async({page})=>{
 let signedIn=false;
 let fieldRequests=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{mode:'required',user:signedIn?{id:'user-1',email:'farmer@example.invalid'}:null}});
  if(path==='/api/auth/login'&&route.request().method()==='POST'){
   signedIn=true;return route.fulfill({json:{user:{id:'user-1',email:'farmer@example.invalid'}}});
  }
  if(path==='/api/auth/logout'&&route.request().method()==='POST'){
   signedIn=false;return route.fulfill({json:{ok:true}});
  }
  if(path==='/api/fields'){fieldRequests++;return route.fulfill({json:[]});}
  return route.fulfill({json:[]});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Sign in to your fields'})).toBeVisible();
 expect(fieldRequests).toBe(0);
 await page.getByLabel('Email').fill('farmer@example.invalid');
 await page.getByLabel('Password').fill('a-long-test-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'My fields'})).toBeVisible();
 await openMenu(page);await page.getByLabel('Your account',{exact:true}).click({force:true});await closeMenu(page);
 await expect(page.getByLabel('Email address',{exact:true})).toHaveValue('farmer@example.invalid');
 expect(fieldRequests).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByRole('heading',{name:'Sign in to your fields'})).toBeVisible();
});
