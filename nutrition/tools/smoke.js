// Headless smoke test: node tools/smoke.js (needs NODE_PATH=$(npm root -g) for playwright). No personal data.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = []; const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'he-IL' })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'nutrition.html')); await page.waitForTimeout(800);
  await page.evaluate(() => { const A = window.App; A.state.supplements = [{ id: 's_2', name: 'ברזל', doses: 2, nutrients: { iron: 30 }, active: true }]; });
  await page.click('[data-tab="log"]'); await page.fill('#quick-input', 'לחם מלא 2 פרוסות'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.click('[data-tab="today"]'); await page.waitForTimeout(200);
  await page.click('[data-act="supp-dose"][data-i="0"]'); await page.waitForTimeout(200);
  const txt = await page.textContent('#now-card');
  console.log('NOW CARD:', txt.replace(/\s+/g, ' ').slice(0, 300));
  console.log('ERRORS:', JSON.stringify(errors)); await browser.close();
})();
