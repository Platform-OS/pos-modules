import { Browser, BrowserContext, Page } from 'playwright';

export async function switchContext(
  currentContext: BrowserContext | null,
  browser: Browser,
  storageStatePath: string
): Promise<{ context: BrowserContext; page: Page }> {
  if (currentContext) {
    await currentContext.close();
  }
  const newContext = await browser.newContext({ storageState: storageStatePath });
  const newPage = await newContext.newPage();
  return { context: newContext, page: newPage };
}
  
