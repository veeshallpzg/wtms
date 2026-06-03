const { test, expect } = require('@playwright/test');

test('homepage loads', async ({ page }) => {
    await page.goto('http://localhost:8080'); // change if needed
    await expect(page).toHaveTitle(/./);
});