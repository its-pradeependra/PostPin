# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calculator.spec.ts >> landing page rate calculator >> shows a validation state for an unserviceable pincode
- Location: e2e\calculator.spec.ts:29:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('rate-calculator').first().getByTestId('calc-origin-area')
Expected pattern: /unknown/i
Received string:  "Pickup pincode"
Timeout: 15000ms

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for getByTestId('rate-calculator').first().getByTestId('calc-origin-area')
    33 × locator resolved to <p aria-live="polite" data-testid="calc-origin-area" class="truncate text-[11px] font-medium leading-tight text-muted-foreground">Pickup pincode</p>
       - unexpected value "Pickup pincode"

```

```yaml
- paragraph: Pickup pincode
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Shipping calculator smoke — the core product flow on the landing page:
  5  |  * real pincodes → live quote from the public rates API. Requires the backend
  6  |  * on :4000 with the seeded pincode master.
  7  |  */
  8  | 
  9  | test.describe("landing page rate calculator", () => {
  10 |   test("calculates a live quote between two metro pincodes", async ({ page }) => {
  11 |     await page.goto("/");
  12 |     const calc = page.getByTestId("rate-calculator").first();
  13 |     await calc.scrollIntoViewIfNeeded();
  14 | 
  15 |     await calc.getByTestId("calc-origin-input").fill("302021");
  16 |     await calc.getByTestId("calc-destination-input").fill("110001");
  17 |     await calc.getByTestId("calc-weight-input").fill("500");
  18 | 
  19 |     // Live pincode captions resolve from the India Post master.
  20 |     await expect(calc.getByTestId("calc-origin-area")).toContainText(/Jaipur/i, { timeout: 15_000 });
  21 | 
  22 |     await calc.getByTestId("calc-submit-btn").click();
  23 | 
  24 |     // A real rupee total renders from the public API.
  25 |     await expect(calc.getByText("Total shipping charge").first()).toBeVisible({ timeout: 15_000 });
  26 |     await expect(calc.getByText(/₹\s?[\d,]+/).first()).toBeVisible();
  27 |   });
  28 | 
  29 |   test("shows a validation state for an unserviceable pincode", async ({ page }) => {
  30 |     await page.goto("/");
  31 |     const calc = page.getByTestId("rate-calculator").first();
  32 |     await calc.scrollIntoViewIfNeeded();
  33 | 
  34 |     await calc.getByTestId("calc-origin-input").fill("000000");
> 35 |     await expect(calc.getByTestId("calc-origin-area")).toContainText(/unknown/i, { timeout: 15_000 });
     |                                                        ^ Error: expect(locator).toContainText(expected) failed
  36 |   });
  37 | });
  38 | 
```