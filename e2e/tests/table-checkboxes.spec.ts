import { Page, expect, test } from '@playwright/test';

const content = [
  '# Table tasks',
  '',
  '- [ ] List task before table',
  '',
  '| State | Detail |',
  '| --- | --- |',
  '| [ ] First task | Keep café 🚀 and **formatting** |',
  '| [X] Second task | Different source marker |',
  '| `code [ ]` | \\[ ] escaped |',
  '| [link](https://example.org) | ordinary [ ] text |',
  '',
  '- [x] List task after table',
].join('\n');

async function mockWiki(page: Page, readOnly = false, holdFirstSave = false) {
  let releaseSave = () => {};
  const saveReleased = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saved = {
    id: 'table-tasks',
    slug: 'table-tasks',
    path: 'table-tasks',
    title: 'Table tasks',
    version: '1',
    kind: 'page',
    content,
    tags: ['preserved'],
    properties: { owner: 'café' },
  };
  const writes: (typeof saved)[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }
    let json: unknown = [];
    if (path === '/api/config') {
      json = {
        authDisabled: !readOnly,
        publicAccess: true,
        httpRemoteUserEnabled: readOnly,
        defaultLanguage: 'en',
        hideLinkMetadataSection: true,
        avatarAllowedExts: [],
      };
    } else if (path === '/api/branding') {
      json = {
        siteName: 'LeafWiki',
        logoFile: '',
        faviconFile: '',
        brandingConstraints: { logoExts: [], faviconExts: [] },
      };
    } else if (path === '/api/auth/me') {
      json = null;
    } else if (path === '/api/tree') {
      json = {
        id: 'root',
        title: 'Root',
        slug: '',
        path: '',
        kind: 'section',
        children: [{ ...saved, children: [] }],
      };
    } else if (path === '/api/pages/by-path') {
      json = saved;
    } else if (path === '/api/pages/table-tasks' && request.method() === 'PUT') {
      const payload = request.postDataJSON();
      expect(payload.version).toBe(saved.version);
      saved = { ...saved, ...payload, version: String(Number(saved.version) + 1) };
      writes.push(saved);
      json = saved;
      if (holdFirstSave && writes.length === 1) await saveReleased;
    }
    await route.fulfill({ json });
  });
  return { writes, saved: () => saved, releaseSave: () => releaseSave() };
}

test('table tasks save the exact source character, retain focus, and survive reload', async ({
  page,
}) => {
  const wiki = await mockWiki(page, false, true);
  await page.goto('/table-tasks');
  const preview = page.locator('.page-viewer__content');
  const tableTasks = preview.locator('table').getByRole('checkbox');
  await expect(tableTasks).toHaveCount(2);
  await expect(preview.locator('li').getByRole('checkbox')).toHaveCount(2);
  await expect(tableTasks.nth(1)).toBeChecked();

  await tableTasks.first().focus();
  await page.keyboard.press('Space');
  await expect.poll(() => wiki.writes.length).toBe(1);
  await expect(tableTasks.first()).toHaveAttribute('aria-disabled', 'true');
  await expect(tableTasks.first()).toBeFocused();
  await page.keyboard.press('Space');
  expect(wiki.writes).toHaveLength(1);
  wiki.releaseSave();
  await expect(tableTasks.first()).toBeChecked();
  await expect(tableTasks.first()).toBeFocused();
  expect(wiki.saved().content).toBe(content.replace('| [ ] First', '| [x] First'));
  expect(wiki.saved().tags).toEqual(['preserved']);
  expect(wiki.saved().properties).toEqual({ owner: 'café' });

  await page.reload();
  await expect(tableTasks.first()).toBeChecked();
  await tableTasks.nth(1).click();
  await expect.poll(() => wiki.writes.length).toBe(2);
  expect(wiki.saved().content).toBe(
    content.replace('| [ ] First', '| [x] First').replace('| [X] Second', '| [ ] Second'),
  );
  await expect(preview.locator('li').getByRole('checkbox').first()).not.toBeChecked();
  await expect(preview.locator('li').getByRole('checkbox').last()).toBeChecked();
});

test('public read-only viewers see disabled table and list tasks without writes', async ({
  page,
}) => {
  const wiki = await mockWiki(page, true);
  await page.goto('/table-tasks');
  const tasks = page.locator('.page-viewer__content').getByRole('checkbox');
  await expect(tasks).toHaveCount(4);
  for (const task of await tasks.all()) await expect(task).toBeDisabled();
  await tasks.nth(1).dispatchEvent('click');
  await tasks.nth(1).dispatchEvent('change');
  expect(wiki.writes).toHaveLength(0);
  expect(wiki.saved().content).toBe(content);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1100, 375]) {
    test(`table checkbox appearance: ${colorScheme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await mockWiki(page);
      await page.goto('/table-tasks');
      const table = page.locator('.page-viewer__content table');
      await expect(table.getByRole('checkbox')).toHaveCount(2);
      for (const checkbox of await table.getByRole('checkbox').all()) {
        await expect(checkbox).toBeVisible();
        const box = await checkbox.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(14);
        expect(box?.height).toBeGreaterThanOrEqual(14);
      }
      await page.screenshot({ path: testInfo.outputPath('table-checkboxes.png'), fullPage: true });
    });
  }
}
