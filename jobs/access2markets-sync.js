/**
 * Access2Markets Sync Job
 * 
 * Cron job: Daily sync from Access2Markets
 * Frequency: Daily at 00:00 UTC
 * 
 * Purpose: Pull latest compliance rules from EU Access2Markets
 */

const access2Markets = require('../services/access2markets');

console.log('========================================');
console.log('Access2Markets Sync Job');
console.log('========================================\n');

// Sync from API
async function run() {
  console.log(`Starting sync at ${new Date().toISOString()}`);
  
  try {
    const result = await access2Markets.syncFromAPI();
    
    console.log('\nSync completed:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Rules loaded: ${result.rulesCount}`);
    console.log(`  Last updated: ${result.lastUpdated}`);
    
    // Get summary
    const config = access2Markets.getConfig();
    console.log('\nConfiguration:');
    console.log(`  Origin: ${config.originCountry}`);
    console.log(`  Destination: ${config.destinationCountry}`);
    console.log(`  Products: ${config.productCategories.length}`);
    
    console.log('\n========================================');
    console.log('Sync job completed successfully');
    console.log('========================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\nSync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run immediately
run();
