import { defineConfig } from '@playwright/test';

// Mobile first (390 px), then desktop (1440 px): CLAUDE.md §7 rule 6 and §10 rule 6.
export default defineConfig({
  testDir: 'test/e2e',
  use: { baseURL: 'http://localhost:8082/Vaihtokaupat/' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node test/pages-sim.mjs',
      url: 'http://localhost:8082/Vaihtokaupat/',
      reuseExistingServer: true,
    },
    {
      // Local Worker with local R2 (wrangler.toml env.local), the site's API on localhost.
      command: 'npx wrangler dev --env local --persist-to .wrangler/e2e',
      url: 'http://localhost:8797/api',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
