const pgp = require('pg-promise')();
const connectionString = process.env.POSTGRES_URL || 'postgresql://user:pass@localhost:5432/culbridge';

/**
 * PostgreSQL + PostGIS for geospatial farm plots (EUDR)
 */
class PostgresPostGIS {
  constructor() {
    this.db = pgp(connectionString);
  }

  async enablePostGIS() {
    await this.db.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  }

  async createFarmTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS farm_plots (
        id SERIAL PRIMARY KEY,
        exporter_id TEXT,
        plot_name TEXT,
        geom GEOMETRY(POLYGON, 4326),
        area_ha NUMERIC,
        risk_score NUMERIC,
        gfw_alerts JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS farm_plots_geom_idx ON farm_plots USING GIST (geom);
    `);
  }

  async addFarmPlot(exporterId, geojson) {
    const geomWKT = `ST_GeomFromGeoJSON('${JSON.stringify(geojson)}')`;
    const area = await this.db.one('SELECT ST_Area($1::geography)/10000 as area_ha', [geomWKT]);
    
    const result = await this.db.one(`
      INSERT INTO farm_plots (exporter_id, geom, area_ha)
      VALUES ($1, $2, $3) RETURNING id
    `, [exporterId, geomWKT, area.area_ha]);
    
    return result.id;
  }

  async findPlotsWithinDistance(lon, lat, distanceKm) {
    const result = await this.db.any(`
      SELECT id, plot_name, ST_AsGeoJSON(geom) as geojson, risk_score
      FROM farm_plots
      WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3*1000)
    `, [lon, lat, distanceKm]);
    
    return result.map(r => ({
      id: r.id,
      plot_name: r.plot_name,
      geojson: JSON.parse(r.geojson),
      risk_score: r.risk_score
    }));
  }

  async deforestationRisk(geomWKT) {
    // Integrate GFW data
    const gfw = require('./global-forest-watch');
    const centroid = await this.db.one('SELECT ST_AsText(ST_Centroid($1)) as point', [geomWKT]);
    
    // Parse lon/lat from WKT POINT
    const coords = centroid.point.match(/POINT\(([-0-9.]+) ([-0-9.]+)\)/);
    const alerts = await gfw.getDeforestationAlerts(parseFloat(coords[1]), parseFloat(coords[2]));
    
    return alerts;
  }
}

module.exports = PostgresPostGIS;

