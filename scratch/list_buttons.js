/* eslint-disable */
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  // Click local bypass
  await page.click('text=Developer / Local PIN Bypass');
  await page.waitForTimeout(500);
  
  // List all buttons on page
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText,
      class: b.className,
      disabled: b.disabled
    }));
  });
  
  console.log('ALL BUTTONS ON PAGE:', JSON.stringify(buttons, null, 2));
  await browser.close();
}

run();
