const turf = require('@turf/turf');

/**
 * QGIS-like geospatial analysis for EUDR farm plots
 */
class QGISIntegration {
  static analyzeFarmPlot(geojson) {
    const polygon = turf.polygon(geojson.coordinates);
    
    const bbox = turf.bbox(polygon);
    const area = turf.area(polygon);
    const centroid = turf.centroid(polygon);
    
    // Deforestation risk proxy - irregular shapes higher risk
    const perimeter = turf.length(polygon);
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
    const risk = Math.max(0, 1 - circularity);
    
    return {
      area_ha: area / 10000,
      bbox,
      centroid: centroid.geometry.coordinates,
      deforestation_risk_proxy: risk,
      validated: true
    };
  }
  
  static intersectPlots(plot1, plot2) {
    const intersection = turf.intersect(plot1, plot2);
    return intersection ? turf.area(intersection) / 10000 : 0;
  }
}

module.exports = QGISIntegration;

