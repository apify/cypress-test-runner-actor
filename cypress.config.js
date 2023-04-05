import { defineConfig } from 'cypress';
// eslint-disable-next-line import/extensions
import mochasowmeReporterPlugin from 'cypress-mochawesome-reporter/plugin.js';

export default defineConfig({
    reporter: 'cypress-mochawesome-reporter',
    reporterOptions: {
        charts: true,
        embeddedScreenshots: true,
        inlineAssets: true,
        saveAllAttempts: false,
    },
    e2e: {
        // to be able to run the tests locally
        baseUrl: 'https://apify.com',
        setupNodeEvents(on) {
            mochasowmeReporterPlugin(on);
        },
    },
});
