/**
 * RASFF Ingestion Job
 * 
 * Cron job: Sync alerts from RASFF
 * Frequency: Every 6 hours
 * 
 * Purpose: Pull latest food safety alerts from EU RASFF
 */

const rasffService = require('../services/rasff-ingestion');

console.log('========================================');
console.log('RASFF Ingestion Job');
console.log('========================================\n');

// Sync from RASFF API
async function run() {
  console.log(`Starting ingestion at ${new Date().toISOString()}`);
  
  try {
    const result = await rasffService.syncFromAPI();
    
    console.log('\nIngestion completed:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Alerts loaded: ${result.alertsCount}`);
    console.log(`  Last synced: ${result.lastSynced}`);
    
    // Get statistics
    const stats = rasffService.getStatistics();
    console.log('\nStatistics:');
    console.log(`  Total alerts: ${stats.totalAlerts}`);
    console.log(`  Total rejections: ${stats.totalRejections}`);
    console.log(`  Overall rejection rate: ${(stats.overallRejectionRate * 100).toFixed(1)}%`);
    
    // Top products
    console.log('\nAlerts by product:');
    for (const [product, count] of Object.entries(stats.byProduct)) {
      console.log(`  ${product}: ${count}`);
    }
    
    // Top origins
    console.log('\nAlerts by origin:');
    for (const [origin, count] of Object.entries(stats.byOrigin)) {
      console.log(`  ${origin}: ${count}`);
    }
    
    // Top ports
    console.log('\nAlerts by port:');
    for (const [port, count] of Object.entries(stats.byPort)) {
      console.log(`  ${port}: ${count}`);
    }
    
    // Get specific rates
    console.log('\nRejection rates:');
    const sesameRate = rasffService.getRejectionRateByProduct('sesame seeds');
    if (sesameRate) {
      console.log(`  Sesame seeds: ${(sesameRate.rejectionRate * 100).toFixed(1)}%`);
    }
    
    const nigeriaRate = rasffService.getRejectionRateByOrigin('Nigeria');
    if (nigeriaRate) {
      console.log(`  Nigeria: ${(nigeriaRate.rejectionRate * 100).toFixed(1)}%`);
    }
    
    const rotterdamRate = rasffService.getRejectionRateByPort('Rotterdam');
    if (rotterdamRate) {
      console.log(`  Rotterdam: ${(rotterdamRate.rejectionRate * 100).toFixed(1)}%`);
    }
    
    console.log('\n========================================');
    console.log('RASFF ingestion completed successfully');
    console.log('========================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\nIngestion failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run immediately
run();
