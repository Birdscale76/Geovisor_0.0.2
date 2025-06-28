import type { BBox, FeatureCollection } from 'geojson';

export const calculateBbox = (geojson: FeatureCollection): BBox | undefined => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasCoordinates = false;

  const processCoordinates = (coords: any[]) => {
    // This is a recursive function that will go through the coordinates array
    if (Array.isArray(coords) && coords.length > 0) {
      // If the first element is a number, we assume it's a coordinate pair
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        hasCoordinates = true;
        minX = Math.min(minX, coords[0]);
        minY = Math.min(minY, coords[1]);
        maxX = Math.max(maxX, coords[0]);
        maxY = Math.max(maxY, coords[1]);
      } else {
        // Otherwise, we go one level deeper
        coords.forEach(processCoordinates);
      }
    }
  };

  geojson.features.forEach(feature => {
    if (feature && feature.geometry) {
      processCoordinates(feature.geometry.coordinates);
    }
  });

  if (hasCoordinates) {
    return [minX, minY, maxX, maxY];
  }

  return undefined;
};