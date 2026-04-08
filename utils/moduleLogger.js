const { run } = require('./db');

class ModuleLogger {
  /**
   * Store module output with deterministic flag
   * Sets immutable=false initially, set to true post-signature
   */
  static async storeOutput(shipmentId, module, output, deterministicFlag = true, verifiedDeterministic = true, immutable = false) {
    const outputJson = typeof output === 'string' ? output : JSON.stringify(output);
    
    const result = await run(`
      INSERT OR REPLACE INTO ShipmentModuleResults 
      (shipment_id, module, output, deterministic_flag, verified_deterministic, immutable)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [shipmentId, module, outputJson, deterministicFlag ? 1 : 0, verifiedDeterministic ? 1 : 0, immutable ? 1 : 0]);
    
    console.log(`[MODULE LOG] ${module} stored for ${shipmentId} (deterministic: ${deterministicFlag})`);
    return result;
  }

  /**
   * Mark module outputs immutable (post digital signature)
   */
  static async markImmutable(shipmentId) {
    await run(`
      UPDATE ShipmentModuleResults 
      SET immutable = 1 
      WHERE shipment_id = ? AND immutable = 0
    `, [shipmentId]);
    console.log(`[IMMUTABLE] All modules marked immutable for ${shipmentId}`);
  }

  /**
   * Get all module outputs for shipment
   */
  static async getOutputs(shipmentId, module = null) {
    const where = module ? 'AND module = ?' : '';
    return await require('./db').all(`
      SELECT module, output, deterministic_flag, verified_deterministic, timestamp, immutable
      FROM ShipmentModuleResults 
      WHERE shipment_id = ? ${where}
      ORDER BY timestamp ASC
    `, module ? [shipmentId, module] : [shipmentId]);
  }

  /**
   * Count deterministic flags
   */
  static async countDeterministic(shipmentId) {
    const result = await require('./db').get(`
      SELECT 
        COUNT(*) as total_modules,
        SUM(deterministic_flag) as deterministic_count,
        SUM(CASE WHEN deterministic_flag = 1 AND verified_deterministic = 1 THEN 1 ELSE 0 END) as fully_verified
      FROM ShipmentModuleResults 
      WHERE shipment_id = ?
    `, [shipmentId]);
    return result;
  }
}

module.exports = ModuleLogger;

