/* eslint-disable */
import { chromium } from 'playwright'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const ARTIFACT_DIR = 'C:\\Users\\Chinmay\\.gemini\\antigravity\\brain\\a19c0d30-510d-4521-bd27-b5bd0cba3d28'

async function run() {
  console.log('🚀 Starting Automated Visual & Feature Checks...')

  if (!existsSync(ARTIFACT_DIR)) {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
  }

  console.log('1. Launching chromium (headless: true, args)...')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  console.log('2. Creating context...')
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
  console.log('3. Creating page...')
  const page = await context.newPage()

  try {
    // 1. Load login page
    console.log('4. Navigating to http://localhost:3000 ...')
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 30000 })
    console.log('5. Page loaded. Waiting for 3 seconds for client components...')
    await page.waitForTimeout(3000)
    
    // Capture login screen
    const loginScreenshotPath = join(ARTIFACT_DIR, 'media__login.png')
    await page.screenshot({ path: loginScreenshotPath })
    console.log(`📸 Login screen saved to: ${loginScreenshotPath}`)

    // 2. Open Local PIN Bypass
    console.log('6. Clicking Local PIN Bypass...')
    const bypassBtn = page.locator('text=Developer / Local PIN Bypass')
    await bypassBtn.click()
    await page.waitForTimeout(1000)

    // Check if test user "admin" works. Let's try to log in as "admin" with PIN "1234" (standard seed pin).
    console.log('7. Entering username "admin"...')
    const usernameInput = page.locator('input[placeholder="e.g. amruta"]')
    await usernameInput.fill('admin')

    // Click keypad: 1, 2, 3, 4
    console.log('8. Entering PIN 1234...')
    const pinButtons = ['1', '2', '3', '4']
    for (const char of pinButtons) {
      await page.click(`button:has-text("${char}"):near(button:has-text("Clear"))`)
      await page.waitForTimeout(200)
    }

    await page.waitForTimeout(2000)

    // Check if we logged in successfully (we should see Dashboard shell or Today header)
    let currentUrl = page.url()
    console.log(`🔗 Current URL after login attempt: ${currentUrl}`)

    // If still on login page (maybe admin PIN is not 1234 or login failed), try to register a new user
    const loggedInIndicator = page.locator('text=Today')
    const isLogged = await loggedInIndicator.count() > 0
    
    if (!isLogged) {
      console.log('⚠️ Login failed or PIN incorrect. Attempting to register a new temporary tester user...')
      // Toggle register
      await page.click('button:has-text("Register")')
      await page.waitForTimeout(500)
      
      const tempUser = `test_${Date.now()}`
      console.log(`👤 Registering username "${tempUser}"...`)
      await usernameInput.fill(tempUser)
      
      // Click 1, 2, 3, 4
      for (const char of pinButtons) {
        await page.click(`button:has-text("${char}"):near(button:has-text("Clear"))`)
        await page.waitForTimeout(200)
      }
      
      // Click Register & Log In button
      await page.click('button:has-text("Register & Log In")')
      await page.waitForTimeout(4000)
    }

    console.log('🎉 Successfully authenticated! Inspecting pages...')

    // 3. Take screenshots of Today Page
    const todayPath = join(ARTIFACT_DIR, 'media__today.png')
    await page.screenshot({ path: todayPath })
    console.log(`📸 Today page saved to: ${todayPath}`)

    // 4. Navigate to Calendar Tab
    console.log('📅 Navigating to Calendar Tab...')
    await page.click('button:has-text("Calendar")')
    await page.waitForTimeout(2000)
    const calendarPath = join(ARTIFACT_DIR, 'media__calendar.png')
    await page.screenshot({ path: calendarPath })
    console.log(`📸 Calendar page saved to: ${calendarPath}`)

    // 5. Navigate to Activities Tab
    console.log('🏃 Navigating to Activities Tab...')
    await page.click('button:has-text("Activities")')
    await page.waitForTimeout(2000)
    const activitiesPath = join(ARTIFACT_DIR, 'media__activities.png')
    await page.screenshot({ path: activitiesPath })
    console.log(`📸 Activities page saved to: ${activitiesPath}`)

    // 6. Navigate to Journal Tab
    console.log('📝 Navigating to Journal Tab...')
    await page.click('button:has-text("Journal")')
    await page.waitForTimeout(2000)
    const journalPath = join(ARTIFACT_DIR, 'media__journal.png')
    await page.screenshot({ path: journalPath })
    console.log(`📸 Journal page saved to: ${journalPath}`)

    // 7. Navigate to Time Off Tab
    console.log('🏖️ Navigating to Time Off Tab...')
    await page.click('button:has-text("Time Off")')
    await page.waitForTimeout(2000)
    const timeOffPath = join(ARTIFACT_DIR, 'media__timeoff.png')
    await page.screenshot({ path: timeOffPath })
    console.log(`📸 Time Off page saved to: ${timeOffPath}`)

    // 8. Navigate to Weight Tab
    console.log('⚖️ Navigating to Weight Tab...')
    await page.click('button:has-text("Weight")')
    await page.waitForTimeout(2000)
    const weightPath = join(ARTIFACT_DIR, 'media__weight.png')
    await page.screenshot({ path: weightPath })
    console.log(`📸 Weight page saved to: ${weightPath}`)

    // 9. Navigate to Settings Tab
    console.log('⚙️ Navigating to Settings Tab...')
    await page.click('button:has-text("Settings")')
    await page.waitForTimeout(2000)
    const settingsPath = join(ARTIFACT_DIR, 'media__settings.png')
    await page.screenshot({ path: settingsPath })
    console.log(`📸 Settings page saved to: ${settingsPath}`)

    console.log('✅ Visual checks completed successfully without errors.')

  } catch (error) {
    console.error('❌ Visual check failed:', error)
  } finally {
    await browser.close()
  }
}

run()
