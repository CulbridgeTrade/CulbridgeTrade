// Telemetry - Log every request
import { TelemetryRecord } from "./types";

const telemetryStore: TelemetryRecord[] = [];

export async function logTelemetry(record: TelemetryRecord): Promise<void> {
  // Add to in-memory store
  telemetryStore.push(record);
  
  // Log to console for MVP visibility
  console.log(`[TELEMETRY] ${record.request_id} | ${record.source} | ${record.decision} | ${record.confidence} | ${record.response_time_ms}ms`);
  
  // In production, this would write to database
  // await db.telemetry.insert(record);
}

export async function getTelemetry(
  limit: number = 100,
  source?: string
): Promise<TelemetryRecord[]> {
  let records = telemetryStore;
  
  if (source) {
    records = records.filter(r => r.source === source);
  }
  
  return records.slice(-limit);
}

export async function getTelemetryStats(): Promise<{
  total_requests: number;
  ok_count: number;
  warning_count: number;
  block_count: number;
  avg_response_time_ms: number;
  sources: Record<string, number>;
}> {
  const stats = {
    total_requests: telemetryStore.length,
    ok_count: 0,
    warning_count: 0,
    block_count: 0,
    avg_response_time_ms: 0,
    sources: {} as Record<string, number>
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

export default { logTelemetry, getTelemetry, getTelemetryStats };
