
import type { Feature } from 'geojson';
import type { DemData, VolumeCalcMethod } from '@/types';
import type { LineString, Polygon } from 'geojson';


/**
 * Calculates the distance between two geographic coordinates using the Haversine formula.
 * @param coords1 - The first coordinate as [longitude, latitude].
 * @param coords2 - The second coordinate as [longitude, latitude].
 * @returns The distance in kilometers.
 */
export function haversineDistance(coords1: number[], coords2: number[]): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = ((coords2[1] - coords1[1]) * Math.PI) / 180;
  const dLon = ((coords2[0] - coords1[0]) * Math.PI) / 180;
  const lat1 = (coords1[1] * Math.PI) / 180;
  const lat2 = (coords2[1] * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the total length of a line string.
 * @param coordinates - An array of coordinates forming the line.
 * @returns The total distance in kilometers.
 */
export function calculateLineDistance(coordinates: number[][]): number {
  let totalDistance = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalDistance += haversineDistance(coordinates[i], coordinates[i + 1]);
  }
  return totalDistance;
}


/**
 * Calculates the approximate area of a polygon using the shoelace formula on projected coordinates.
 * This is an approximation and works best for small areas.
 * @param coordinates - An array of coordinates forming the polygon's outer ring.
 * @returns The area in square meters.
 */
export function calculatePolygonArea(coordinates: number[][]): number {
    if (!coordinates || coordinates.length < 3) {
        return 0;
    }

    let area = 0;
    const R2 = 6371e3 * 6371e3; // Earth's radius squared in meters

    for (let i = 0; i < coordinates.length; i++) {
        const p1 = coordinates[i];
        const p2 = coordinates[(i + 1) % coordinates.length];

        const p1_rad = [p1[0] * Math.PI / 180, p1[1] * Math.PI / 180];
        const p2_rad = [p2[0] * Math.PI / 180, p2[1] * Math.PI / 180];
        
        area += (p2_rad[0] - p1_rad[0]) * (2 + Math.sin(p1_rad[1]) + Math.sin(p2_rad[1]));
    }

    return Math.abs(area * R2 / 2.0);
}

/**
 * Formats a distance value into a readable string (km or m).
 * @param distanceInKm - The distance in kilometers.
 * @returns A formatted string.
 */
export function formatDistance(distanceInKm: number): string {
    if (distanceInKm < 1) {
        return `${(distanceInKm * 1000).toFixed(2)} m`;
    }
    return `${distanceInKm.toFixed(2)} km`;
}

/**
 * Formats an area value into a readable string (sq km or sq m).
 * @param areaInSqM - The area in square meters.
 * @returns A formatted string.
 */
export function formatArea(areaInSqM: number): string {
    if (areaInSqM < 10000) {
        return `${areaInSqM.toFixed(2)} m²`;
    }
    return `${(areaInSqM / 1000000).toFixed(2)} km²`;
}


// --- DEM Analysis Functions ---

function getElevationFromDem(lon: number, lat: number, dem: DemData): number | null {
  const { values, width, height, bbox, wgs84Bbox, noDataValue, projConverter } = dem;
  
  if (lon < wgs84Bbox[0] || lon > wgs84Bbox[2] || lat < wgs84Bbox[1] || lat > wgs84Bbox[3]) {
    return null;
  }
  
  let projCoords: [number, number] = [lon, lat];
  if (projConverter) {
    projCoords = projConverter([lon, lat]);
  }

  const [projX, projY] = projCoords;
  const [minX, minY, maxX, maxY] = bbox;

  if (projX < minX || projX > maxX || projY < minY || projY > maxY) {
      return null;
  }
  
  const xPercent = (projX - minX) / (maxX - minX);
  const yPercent = (maxY - projY) / (maxY - minY);

  const px = Math.floor(xPercent * width);
  const py = Math.floor(yPercent * height);
  
  if (px < 0 || px >= width || py < 0 || py >= height) {
    return null;
  }
  
  const index = py * width + px;
  const elevation = values[index];

  if (elevation === noDataValue) {
    return null;
  }
  
  return elevation;
}

export function getProfileFromDem(line: Feature<LineString>, dem: DemData, samples = 100): {distance: number, elevation: number}[] | null {
  const profile: {distance: number, elevation: number}[] = [];
  const coords = line.geometry.coordinates;
  const totalDistanceKm = calculateLineDistance(coords);
  
  if (totalDistanceKm === 0) return null;

  let accumulatedDist = 0;
  
  const startElev = getElevationFromDem(coords[0][0], coords[0][1], dem);
  if (startElev !== null) {
      profile.push({ distance: 0, elevation: startElev });
  }

  for (let i = 0; i < coords.length - 1; i++) {
    const startPoint = coords[i];
    const endPoint = coords[i+1];
    const segmentDist = haversineDistance(startPoint, endPoint);
    const numSegmentSamples = Math.max(2, Math.ceil(samples * (segmentDist / totalDistanceKm)));
    
    for (let j = 1; j <= numSegmentSamples; j++) {
      const t = j / numSegmentSamples;
      const lon = startPoint[0] + (endPoint[0] - startPoint[0]) * t;
      const lat = startPoint[1] + (endPoint[1] - startPoint[1]) * t;
      const sampleDist = accumulatedDist + segmentDist * t;
      const elev = getElevationFromDem(lon, lat, dem);
      if (elev !== null) {
        profile.push({ distance: sampleDist * 1000, elevation: elev });
      }
    }
    accumulatedDist += segmentDist;
  }

  return profile.length > 1 ? profile : null;
}

function isPointInPolygon(point: number[], vs: number[][]): boolean {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

function solve3x3(A: number[][], b: number[]): number[] | null {
    const detA = A[0][0]*(A[1][1]*A[2][2] - A[2][1]*A[1][2]) -
                 A[0][1]*(A[1][0]*A[2][2] - A[1][2]*A[2][0]) +
                 A[0][2]*(A[1][0]*A[2][1] - A[1][1]*A[2][0]);

    if (Math.abs(detA) < 1e-9) return null;

    const invDetA = 1.0 / detA;
    const adjA = [
        [ (A[1][1]*A[2][2] - A[2][1]*A[1][2]), -(A[0][1]*A[2][2] - A[0][2]*A[2][1]),  (A[0][1]*A[1][2] - A[0][2]*A[1][1])],
        [-(A[1][0]*A[2][2] - A[1][2]*A[2][0]),  (A[0][0]*A[2][2] - A[0][2]*A[2][0]), -(A[0][0]*A[1][2] - A[1][0]*A[0][2])],
        [ (A[1][0]*A[2][1] - A[2][0]*A[1][1]), -(A[0][0]*A[2][1] - A[2][0]*A[0][1]),  (A[0][0]*A[1][1] - A[1][0]*A[0][1])]
    ];
    
    const result = [
        invDetA * (adjA[0][0]*b[0] + adjA[0][1]*b[1] + adjA[0][2]*b[2]),
        invDetA * (adjA[1][0]*b[0] + adjA[1][1]*b[1] + adjA[1][2]*b[2]),
        invDetA * (adjA[2][0]*b[0] + adjA[2][1]*b[1] + adjA[2][2]*b[2]),
    ];
    return result;
}


interface VolumeOptions {
  method: VolumeCalcMethod;
  fixedElevation?: number;
  gridSize?: number;
}

export function getVolumeFromDem(polygon: Feature<Polygon>, dem: DemData, options: VolumeOptions) {
  const { method, fixedElevation, gridSize = 50 } = options;
  const polyCoordsWgs = polygon.geometry.coordinates[0];
  const { projConverter } = dem;
  const polyCoordsProj = projConverter ? polyCoordsWgs.map(c => projConverter(c as [number, number])) : polyCoordsWgs;

  let basePlane: { a: number, b: number, c: number } | { elevation: number } | null = null;

  const perimeterPoints = polyCoordsWgs.map(coord => {
      const proj = projConverter ? projConverter(coord as [number,number]) : coord;
      return {
          wgs: coord,
          proj: proj,
          elevation: getElevationFromDem(coord[0], coord[1], dem)
      };
  }).filter(p => p.elevation !== null);

  if (perimeterPoints.length < 3) return null;

  if (method === 'lowestPoint') {
      const minElev = Math.min(...perimeterPoints.map(p => p.elevation!));
      basePlane = { elevation: minElev };
  } else if (method === 'averagePerimeter') {
      const avgElev = perimeterPoints.reduce((sum, p) => sum + p.elevation!, 0) / perimeterPoints.length;
      basePlane = { elevation: avgElev };
  } else if (method === 'fixedElevation' && fixedElevation !== undefined) {
      basePlane = { elevation: fixedElevation };
  } else if (method === 'bestFit') {
      const n = perimeterPoints.length;
      let sumX=0, sumY=0, sumZ=0, sumXY=0, sumX2=0, sumY2=0, sumXZ=0, sumYZ=0;
      perimeterPoints.forEach(({ proj, elevation }) => {
          const [x, y] = proj;
          const z = elevation!;
          sumX += x; sumY += y; sumZ += z;
          sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
          sumXZ += x * z; sumYZ += y * z;
      });
      const A = [ [sumX2, sumXY, sumX], [sumXY, sumY2, sumY], [sumX, sumY, n] ];
      const b = [ sumXZ, sumYZ, sumZ ];
      const planeParams = solve3x3(A, b);
      if (planeParams) {
          basePlane = { a: planeParams[0], b: planeParams[1], c: planeParams[2] };
      }
  }

  if (!basePlane) return null;
  
  const [minLon, minLat, maxLon, maxLat] = polygon.bbox || [Infinity, Infinity, -Infinity, -Infinity];
  const [bboxMinProjX, bboxMinProjY] = projConverter ? projConverter([minLon, minLat]) : [minLon, minLat];
  const [bboxMaxProjX, bboxMaxProjY] = projConverter ? projConverter([maxLon, maxLat]) : [maxLon, maxLat];

  const lonStep = (maxLon - minLon) / gridSize;
  const latStep = (maxLat - minLat) / gridSize;
  const projXStep = (bboxMaxProjX - bboxMinProjX) / gridSize;
  const projYStep = (bboxMaxProjY - bboxMinProjY) / gridSize;

  const centerLat = minLat + (maxLat - minLat) / 2;
  const cellWidthMeters = haversineDistance([minLon, centerLat], [minLon + lonStep, centerLat]) * 1000;
  const cellHeightMeters = haversineDistance([minLon, minLat], [minLon, minLat + latStep]) * 1000;
  const cellArea = cellWidthMeters * cellHeightMeters;

  let cutVolume = 0;
  let fillVolume = 0;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lon = minLon + lonStep * (i + 0.5);
      const lat = minLat + latStep * (j + 0.5);

      if (isPointInPolygon([lon, lat], polyCoordsWgs)) {
        const demElevation = getElevationFromDem(lon, lat, dem);
        if (demElevation !== null) {
          const projX = bboxMinProjX + projXStep * (i + 0.5);
          const projY = bboxMinProjY + projYStep * (j + 0.5);
          
          let baseElevation: number;
          if ('elevation' in basePlane) {
              baseElevation = basePlane.elevation;
          } else {
              baseElevation = basePlane.a * projX + basePlane.b * projY + basePlane.c;
          }
          
          const delta = demElevation - baseElevation;
          if (delta > 0) {
              fillVolume += delta * cellArea;
          } else {
              cutVolume += -delta * cellArea;
          }
        }
      }
    }
  }

  return { 
    cut: cutVolume, 
    fill: fillVolume, 
    net: fillVolume - cutVolume,
    basePlane: basePlane,
    method: method,
  };
}


export const getElevationForPoint = getElevationFromDem;
