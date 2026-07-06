import { expect, test } from "@playwright/test";

/**
 * Shipping calculator smoke — the core product flow on the landing page:
 * real pincodes → live quote from the public rates API. Requires the backend
 * on :4000 with the seeded pincode master.
 */

test.describe("landing page rate calculator", () => {
  test("calculates a live quote between two metro pincodes", async ({ page }) => {
    await page.goto("/");
    const calc = page.getByTestId("rate-calculator").first();
    await calc.scrollIntoViewIfNeeded();

    await calc.getByTestId("calc-origin-input").fill("302021");
    await calc.getByTestId("calc-destination-input").fill("110001");
    await calc.getByTestId("calc-weight-input").fill("500");

    // Live pincode captions resolve from the India Post master.
    await expect(calc.getByTestId("calc-origin-area")).toContainText(/Jaipur/i, { timeout: 30_000 });

    await calc.getByTestId("calc-submit-btn").click();

    // A real rupee total renders from the public API.
    await expect(calc.getByText("Total shipping charge").first()).toBeVisible({ timeout: 30_000 });
    await expect(calc.getByText(/₹\s?[\d,]+/).first()).toBeVisible();
  });

  test("shows a validation state for an unserviceable pincode", async ({ page }) => {
    await page.goto("/");
    const calc = page.getByTestId("rate-calculator").first();
    await calc.scrollIntoViewIfNeeded();

    await calc.getByTestId("calc-origin-input").fill("000000");
    await expect(calc.getByTestId("calc-origin-area")).toContainText(/unknown/i, { timeout: 30_000 });
  });
});
