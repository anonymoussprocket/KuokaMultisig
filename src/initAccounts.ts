import * as fs from 'fs';

import { initAccounts, initConseil } from './util';

async function run() {
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    await initAccounts('accounts', config['node'], 'tz1*.json', true, true);
}

run();
