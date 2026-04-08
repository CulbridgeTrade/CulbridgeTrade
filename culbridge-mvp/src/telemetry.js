// Telemetry - Log every request
const telemetryStore = [];

export async function logTelemetry(record) {
  telemetryStore.push(record);
  console.log(`[TELEMETRY] ${record.request_id} | ${record.source} | ${record.decision} | ${record.confidence} | ${record.response_time_ms}ms`);
}

export async function getTelemetry(limit, source) {
  let records = telemetryStore;
  if (source) {
    records = records.filter(r => r.source === source);
  }
  return records.slice(-(limit || 100));
}

export async function getTelemetryStats() {
  const stats = {
    total_requests: telemetryStore.length,
    ok_count: 0,
    warning_count: 0,
    block_count: 0,
    avg_response_time_ms: 0,
    sources: {}
  };

  let totalTime = 0;
  
  for (const record of telemetryStore) {
    if (record.decision === "OK") stats.ok_count++;
    if (record.decision === "WARNING") stats.warning_count++;
    if (record.decision === "BLOCK") stats.block_count++;
    
    totalTime += record.response_time_ms;
    
    if (!stats.sources[record.source]) {
      stats.sources[record.source] = 0;
    }
    stats.sources[record.source]++;
  }
  
  stats.avg_response_time_ms = stats.total_requests > 0 
    ? Math.round(totalTime / stats.total_requests) 
    : 0;

  return stats;
}
