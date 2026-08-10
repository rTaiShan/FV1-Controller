import { expect, test } from "@playwright/test"

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const result = await page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const scrollWidth = document.documentElement.scrollWidth
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          className: element.className?.toString() || "",
          tag: element.tagName.toLowerCase(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .sort((a, b) => Math.max(Math.abs(b.left), b.right - viewportWidth) - Math.max(Math.abs(a.left), a.right - viewportWidth))
      .slice(0, 5)

    return { offenders, scrollWidth, viewportWidth }
  })

  expect(result.scrollWidth, JSON.stringify(result.offenders, null, 2)).toBeLessThanOrEqual(result.viewportWidth)
}

async function expectActivePanelCentered(page: import("@playwright/test").Page) {
  const result = await page.getByTestId("active-tab-panel").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      panelCenter: rect.left + rect.width / 2,
      viewportCenter: window.innerWidth / 2,
      width: rect.width,
    }
  })

  expect(Math.abs(result.panelCenter - result.viewportCenter), JSON.stringify(result)).toBeLessThanOrEqual(2)
  expect(result.width, JSON.stringify(result)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
}

async function expectCurrentTabLayoutOk(page: import("@playwright/test").Page) {
  await expectNoHorizontalOverflow(page)
  await expectActivePanelCentered(page)
}

test.describe("responsive tab layout", () => {
  test("all tabs stay centered without page-level horizontal overflow", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Edit Settings and Patches" })).toBeVisible()
    await expectCurrentTabLayoutOk(page)

    await page.getByLabel("More connection options").click()
    await page.getByText("Use mock device").click()
    await expect(page.getByRole("heading", { name: "Footswitch" })).toBeVisible()
    await expectCurrentTabLayoutOk(page)

    await page.getByRole("tab", { name: "3. Review Changes" }).click()
    await expect(page.getByRole("heading", { name: "View and Modify Changes" })).toBeVisible()
    await expectCurrentTabLayoutOk(page)

    await page.getByRole("tab", { name: "2. Select Settings" }).click()
    await expect(page.getByRole("heading", { name: "Edit Patches" })).toBeVisible()
    await expectCurrentTabLayoutOk(page)
  })
})
