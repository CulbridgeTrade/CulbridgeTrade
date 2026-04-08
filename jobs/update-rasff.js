// Cron job: python services/rasff-scraper.py
const { exec } = require('child_process');
const cron = require('node-cron');

cron.schedule('0 2 * * 1', () => {  // Weekly Monday 2AM
  exec('python3 services/rasff-scraper.py', (err, stdout, stderr) => {
    console.log('RASFF update:', stdout);
    if (err) console.error('RASFF failed:', stderr);
  });
});

console.log('RASFF cron scheduled');

