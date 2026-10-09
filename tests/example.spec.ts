import { test, expect } from '@playwright/test';

test('homepage has title and correct headings', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Shared Notes/);

  // Expect the main heading to exist.
  await expect(page.locator('h1')).toHaveText('Shared Notes');
  
  // Expect the login button to be visible
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
});
