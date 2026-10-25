import path from "node:path";
import { expect, test } from "@playwright/test";

// The second test asks about the library built by the first one.
test.describe.configure({ mode: "serial" });

test("upload a document, ask a question and open the cited passage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("mock answers")).toBeVisible();

  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(import.meta.dirname, "fixtures/travel-policy.md"));
  const library = page.getByRole("list", { name: "Document library" });
  await expect(library.getByText("Travel Policy")).toBeVisible();
  await expect(library.getByText(/\d+ chunks?/)).toBeVisible();

  await page
    .getByRole("textbox", { name: "Question" })
    .fill("What is the daily meal allowance abroad?");
  await page.getByRole("button", { name: "Send question" }).click();

  const answer = page.getByTestId("answer");
  await expect(answer).toContainText("daily allowance of 45 EUR");
  await answer.getByRole("button", { name: "Open source 1" }).click();

  const drawer = page.getByRole("complementary", { name: "Source passage" });
  await expect(drawer).toContainText("Travel Policy › Per Diem");
  await expect(drawer.getByTestId("cited-passage")).toContainText("45 EUR for meals");
});

test("says so when the documents do not contain an answer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Travel Policy")).toBeVisible();

  await page
    .getByRole("textbox", { name: "Question" })
    .fill("Who won the football World Cup in 1998?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("No answer found in your documents")).toBeVisible();
});
