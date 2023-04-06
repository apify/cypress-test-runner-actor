import { Actor } from 'apify';
import fs from 'fs';
import cypress from 'cypress';
import log from '@apify/log';
import path from 'path';
import 'console.table';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const fileStat = promisify(fs.stat);

// eslint-disable-next-line no-underscore-dangle
const __dirname = fileURLToPath(new URL('.', import.meta.url));

await Actor.init();

const { specCode, ...cypressConfig } = await Actor.getInput();
log.info(`Running tests with following config: ${JSON.stringify({ specCode, ...cypressConfig })}`);

// TODO: Create this file from inut
const specFilename = path.join(__dirname, 'cypress', 'e2e', 'spec.cy.js');

await writeFile(specFilename, specCode, { encoding: 'utf-8' });

const kvs = await Actor.openKeyValueStore();
const dataset = await Actor.openDataset();

const result = await cypress.run({ config: cypressConfig, spec: specFilename });

// Save the full result as output
await kvs.setValue('RESULT', result);

// Save the HTML report as output
const reportFilename = path.join(__dirname, 'cypress', 'reports', 'html', 'index.html');

try {
    await fileStat(reportFilename);
} catch (e) {
    log.error('Unable to generate report', { reportFilename });
    Actor.exit({ exitCode: 1, statusMessage: 'Report file not found' });
}

await kvs.setValue(
    'OUTPUT',
    await readFile(reportFilename, { encoding: 'utf-8' }),
    { contentType: 'text/html' },
);

const run = result.runs[0];

if (run.video) {
    await kvs.setValue('RECORDING', fs.readFileSync(run.video), { contentType: 'video/mp4' });
}

let screenshotCounter = 0;
let allTestsPassed = true;

// We want to push the tests to the dataset, not the specs - we only have one file to work with
for (const test of run.tests) {
    if (test.state !== 'passed') {
        allTestsPassed = false;
    }
    // Duration is sum of duration of all attempts
    let duration = 0;
    const screenshotUrls = [];
    for (const attempt of test.attempts) {
        duration += attempt.duration;
        // Save all the screenshots
        for (const screenshot of attempt.screenshots) {
            const screenshotName = `SCREENSHOT_${screenshotCounter}`;
            const screenshotData = fs.readFileSync(screenshot.path);
            await kvs.setValue(screenshotName, screenshotData, { contentType: 'image/png' });
            screenshotUrls.push(kvs.getPublicUrl(screenshotName));
            screenshotCounter++;
        }
    }
    await dataset.pushData({
        title: test.title.join(' '),
        displayError: test.displayError,
        state: test.state,
        duration,
        attempts: test.attempts.length,
        screenshotUrl: screenshotUrls[0],
        screenshotUrls,
        rawData: test,
    });
}

log.info('See dataset for results of individual tests', {
    videoLink: run.video ? kvs.getPublicUrl('RECORDING') : undefined,
    resultsLink: kvs.getPublicUrl('OUTPUT'),
});

if (!allTestsPassed) {
    Actor.exit({ exitCode: 1, statusMessage: 'Some tests have failed' });
}

await Actor.exit();
