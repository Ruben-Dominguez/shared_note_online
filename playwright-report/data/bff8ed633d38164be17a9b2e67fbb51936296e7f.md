# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-guard.spec.ts >> Authentication & Guarding >> redirects or denies access for unauthenticated users visiting a private list
- Location: tests/auth-guard.spec.ts:4:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('h2')
Expected: "Access Denied"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" locator('h2') with timeout 10000ms
  - waiting for locator('h2')

```

```yaml
- main:
  - heading "Shared Notes" [level=1]
  - paragraph: The perfect place to keep track of movies, series, and games you want to enjoy together.
  - button "Continue with Google"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Authentication & Guarding', () => {
  4  |   test('redirects or denies access for unauthenticated users visiting a private list', async ({ page }) => {
  5  |     // Navigate to a fake list ID
  6  |     await page.goto('/list/fake_secure_list_12345');
  7  | 
  8  |     // Wait for the page to finish its initial Firebase loading state
  9  |     // Since Firebase evaluates the auth state (null) and the document (not found / forbidden), 
  10 |     // it should show our "Access Denied" component.
> 11 |     await expect(page.locator('h2')).toHaveText('Access Denied', { timeout: 10000 });
     |                                      ^ Error: expect(locator).toHaveText(expected) failed
  12 |     
  13 |     // Check if the back to dashboard button exists
  14 |     const backBtn = page.getByRole('link', { name: /Back to Dashboard/i });
  15 |     await expect(backBtn).toBeVisible();
  16 | 
  17 |     // Click it and ensure it goes back to the dashboard/homepage
  18 |     await backBtn.click();
  19 |     await expect(page).toHaveURL(/.*dashboard/);
  20 |   });
  21 | });
  22 | 
```