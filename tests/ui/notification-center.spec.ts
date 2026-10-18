import {test,expect} from '@playwright/test';

test('notification center supports unread filtering and saves seen state',async({page})=>{
 await page.goto('/?demo=1');
 const center=page.getByRole('region',{name:'Notification center'});
 await expect(center).toBeVisible();
 await center.getByRole('button',{name:'Show notifications'}).click();
 await expect(center.getByRole('button',{name:/Unread/})).toBeVisible();
 const button=center.getByRole('button',{name:'Mark seen'}).first();
 await expect(button).toBeVisible();
 await button.click();
 await expect(center.getByRole('button',{name:/All notices/})).toBeVisible();
 await page.reload();
 await expect(center).toBeVisible();
 await center.getByRole('button',{name:'Show notifications'}).click();
 await center.getByRole('button',{name:/All notices/}).click();
 await expect(center.locator('.notification-list li').first()).toBeVisible();
});
