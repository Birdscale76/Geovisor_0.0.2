"use client";

import { kml } from "@tmcw/togeojson";
// @ts-ignore - shpjs doesn't have TypeScript declarations
import shp from "shpjs";
import { fromArrayBuffer } from "geotiff";
import type { Feature, FeatureCollection, Polygon, BBox } from "geojson";
import type { RasterLayerData, UserLayer, VectorLayerData, DemData } from "@/types";
import proj4 from "proj4";
import JSZip from "jszip";

type NewLayerData = Omit<UserLayer, "id" | "visible">;

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const checkCRS = (data: any): void => {
  if (data.crs) {
    const crsName = data.crs.properties?.name;
    if (crsName) {
      // Common names for WGS84
      const wgs84Aliases = [
        "urn:ogc:def:crs:OGC:1.3:CRS84",
        "EPSG:4326",
      ];
      if (!wgs84Aliases.includes(crsName)) {
        console.warn(
          `GeoJSON file has a CRS defined: "${crsName}". The application expects WGS84 (EPSG:4326) and will not reproject the data. The layer may not display correctly.`
        );
      }
    }
  }
};

export const parseGeoJSON = async (file: File): Promise<NewLayerData[]> => {
  const fileContent = await readFileAsText(file);
  const data = JSON.parse(fileContent) as VectorLayerData;
  checkCRS(data);
  return [{ name: file.name, type: "vector", data }];
};

const getMimeType = (filename: string): string => {
  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};

export const parseKMLOrKMZ = async (file: File): Promise<NewLayerData[]> => {
  let kmlString: string;
  let zip: JSZip | null = null;
  const isKmz = file.name.toLowerCase().endsWith(".kmz");

  if (isKmz) {
    const buffer = await readFileAsArrayBuffer(file);
    zip = await JSZip.loadAsync(buffer);
    const kmlFile = Object.values(zip.files).find((f) =>
      f.name.toLowerCase().endsWith(".kml")
    );
    if (!kmlFile) {
      throw new Error("No .kml file found in the .kmz archive.");
    }
    kmlString = await kmlFile.async("string");
  } else {
    kmlString = await readFileAsText(file);
  }

  const dom = new DOMParser().parseFromString(kmlString, "text/xml");

  if (zip) {
    const hrefs = dom.getElementsByTagName("href");
    for (let i = 0; i < hrefs.length; i++) {
      const href = hrefs[i];
      const path = href.textContent;
      if (path && !path.startsWith("http") && !path.startsWith("data:")) {
        // KML paths can be relative. Find the file in the zip.
        const imageFile = Object.values(zip.files).find((f) =>
          f.name.endsWith(path)
        );
        if (imageFile) {
          const base64 = await imageFile.async("base64");
          const mimeType = getMimeType(imageFile.name);
          href.textContent = `data:${mimeType};base64,${base64}`;
        }
      }
    }
  }

  const geojson = kml(dom) as FeatureCollection;

  const vectorFeatures: Feature[] = [];
  const rasterLayers: NewLayerData[] = [];
  let groundOverlayCounter = 0;

  for (const feature of geojson.features) {
    if (feature.properties?.icon && feature.geometry.type === "Polygon") {
      groundOverlayCounter++;
      const polygon = feature.geometry as Polygon;
      // togeojson polygon is [[w,s], [e,s], [e,n], [w,n], [w,s]]
      // maplibre image coordinates are [[w,n], [e,n], [e,s], [w,s]]
      const [sw, se, ne, nw] = polygon.coordinates[0];
      if (!sw || !se || !ne || !nw) continue;

      const coordinates = [nw, ne, se, sw];

      const rasterData: RasterLayerData = {
        url: feature.properties.icon,
        coordinates: coordinates as number[][],
      };

      rasterLayers.push({
        name:
          feature.properties.name ||
          `${file.name} - Overlay ${groundOverlayCounter}`,
        type: "raster",
        data: rasterData,
      });
    } else {
      vectorFeatures.push(feature);
    }
  }

  const resultLayers: NewLayerData[] = [...rasterLayers];

  if (vectorFeatures.length > 0) {
    const vectorData: VectorLayerData = {
      type: "FeatureCollection",
      features: vectorFeatures,
    };
    resultLayers.push({
      name: file.name.replace(/\.(kml|kmz)$/i, "") + " (vectors)",
      type: "vector",
      data: vectorData,
    });
  }

  if (resultLayers.length === 0) {
    throw new Error("KML/KMZ file does not contain any renderable features.");
  }

  // If there's only one vector layer and no rasters, just use the file name.
  if (resultLayers.length === 1 && resultLayers[0].type === "vector") {
    resultLayers[0].name = file.name;
  }

  return resultLayers;
};

export const parseShapefile = async (file: File): Promise<NewLayerData[]> => {
  const buffer = await readFileAsArrayBuffer(file);
  
  // shp.parseZip can be unreliable with nested folders. We'll parse manually.
  const zip = await JSZip.loadAsync(buffer).catch(e => {
      console.error("Error reading zip file:", e);
      throw new Error("Could not read the provided zip file. It may be corrupted or in an unsupported format.");
  });

  const shpFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.shp') && !f.dir);
  const dbfFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.dbf') && !f.dir);

  if (!shpFile) throw new Error('The provided zip archive must contain a .shp file.');
  if (!dbfFile) throw new Error('The provided zip archive must contain a .dbf file.');
  
  const prjFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.prj') && !f.dir);

  const shpBuffer = await shpFile.async('arraybuffer');
  const dbfBuffer = await dbfFile.async('arraybuffer');
  const prjString = prjFile ? await prjFile.async('string') : undefined;

  const geojson = await shp.combine([
    shp.parseShp(shpBuffer, prjString),
    shp.parseDbf(dbfBuffer),
  ]);
  
  const data = geojson as FeatureCollection;

  if (!data || !data.features || data.features.length === 0) {
    throw new Error("Shapefile parsed, but it contains no features.");
  }
  
  return [{ name: file.name, type: 'vector', data }];
};

export const parseGeoTIFF = async (file: File): Promise<NewLayerData[]> => {
  console.log("=== PARSEGEOTIFF FUNCTION CALLED ===");
  console.log(`Processing file: ${file.name}`);
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const geoKeys = image.getGeoKeys();
  const epsgCode = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;

  const originalBbox = image.getBoundingBox();
  const [minX, minY, maxX, maxY] = originalBbox;

  let wgs84Corners = [
    [minX, maxY], // top-left
    [maxX, maxY], // top-right
    [maxX, minY], // bottom-right
    [minX, minY], // bottom-left
  ];
  
  let projConverter: ((coords: [number, number]) => [number, number]) | undefined;

  if (epsgCode && epsgCode !== 4326) {
    const fromProjection = 'EPSG:4326';
    const toProjection = `EPSG:${epsgCode}`;
    try {
      proj4.defs(toProjection, await (await fetch(`https://epsg.io/${epsgCode}.proj4`)).text());
      const converter = proj4(fromProjection, toProjection);
      wgs84Corners = wgs84Corners.map(coord => converter.inverse(coord));
      projConverter = converter.forward as (coords: [number, number]) => [number, number];
    } catch (e) {
      console.error(`Projection error:`, e);
      throw new Error(
        `Failed to reproject GeoTIFF from EPSG:${epsgCode} to WGS84. The projection may be unsupported.`
      );
    }
  }

  const width = image.getWidth();
  const height = image.getHeight();
  const bandCount = image.getSamplesPerPixel(); // Get actual band count
  const rasters = await image.readRasters();
  const noDataValue = image.getGDALNoData();

  // Add debug logging for band count
  console.log(`=== GEOTIFF PARSING DEBUG ===`);
  console.log(`File: ${file.name}`);
  console.log(`Band count: ${bandCount} (type: ${typeof bandCount})`);
  console.log(`Width: ${width}, Height: ${height}`);
  console.log(`No data value: ${noDataValue}`);
  console.log(`============================`);

  const wgs84Bbox: BBox = [
    wgs84Corners[0][0],
    wgs84Corners[2][1],
    wgs84Corners[1][0],
    wgs84Corners[0][1],
  ];

  // Create canvas for preview
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas context");

  if (bandCount === 1) {
    // Single band - treat as elevation/DEM data
    const demValues = rasters[0] as Float32Array;

    // Find min/max for normalization (ignoring noDataValue)
    let min = Infinity, max = -Infinity;
    for (const v of demValues) {
      if (v !== noDataValue) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    const range = max - min;
    const imageData = ctx.createImageData(width, height);
    const dataArr = imageData.data;

    // Create grayscale preview
    for (let i = 0; i < demValues.length; i++) {
      const value = demValues[i];
      const color = value === noDataValue || range === 0 ? 0 : Math.round(((value - min) / range) * 255);
      dataArr[i * 4] = color;
      dataArr[i * 4 + 1] = color;
      dataArr[i * 4 + 2] = color;
      dataArr[i * 4 + 3] = value === noDataValue ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const dem: DemData = {
      values: demValues,
      width,
      height,
      bbox: originalBbox as [number, number, number, number, number, number],
      wgs84Bbox,
      noDataValue,
      projConverter
    };

    // Create data object with explicit bands property
    const data = {
      url: canvas.toDataURL(),
      coordinates: wgs84Corners,
      dem,
      bands: bandCount,
    };

    console.log(`=== SINGLE BAND DATA CREATED ===`);
    console.log(`Band count being set: ${bandCount}`);
    console.log(`Data object:`, data);
    console.log(`Data bands property:`, data.bands);
    console.log(`Data keys:`, Object.keys(data));
    console.log(`===============================`);

    return [{ name: file.name, type: "raster", data }];

  } else {
    // Multi-band - treat as imagery data
    const imageData = ctx.createImageData(width, height);
    const dataArr = imageData.data;

    if (bandCount >= 3) {
      // RGB or RGBA imagery
      const redBand = rasters[0] as Float32Array;
      const greenBand = rasters[1] as Float32Array;
      const blueBand = rasters[2] as Float32Array;
      const alphaBand = bandCount >= 4 ? rasters[3] as Float32Array : null;

      // Find min/max for each band for normalization
      const getBandMinMax = (band: Float32Array) => {
        let min = Infinity, max = -Infinity;
        for (const v of band) {
          if (v !== noDataValue) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        return { min, max };
      };

      const redMinMax = getBandMinMax(redBand);
      const greenMinMax = getBandMinMax(greenBand);
      const blueMinMax = getBandMinMax(blueBand);

      const normalizeValue = (value: number, min: number, max: number) => {
        if (value === noDataValue || max === min) return 0;
        return Math.round(((value - min) / (max - min)) * 255);
      };

      // Create RGB preview
      for (let i = 0; i < redBand.length; i++) {
        const red = normalizeValue(redBand[i], redMinMax.min, redMinMax.max);
        const green = normalizeValue(greenBand[i], greenMinMax.min, greenMinMax.max);
        const blue = normalizeValue(blueBand[i], blueMinMax.min, blueMinMax.max);
        const alpha = alphaBand ? normalizeValue(alphaBand[i], 0, 255) : 255;

        dataArr[i * 4] = red;
        dataArr[i * 4 + 1] = green;
        dataArr[i * 4 + 2] = blue;
        dataArr[i * 4 + 3] = redBand[i] === noDataValue ? 0 : alpha;
      }
    } else {
      // 2-band or other cases - create a basic visualization
      const firstBand = rasters[0] as Float32Array;
      let min = Infinity, max = -Infinity;
      for (const v of firstBand) {
        if (v !== noDataValue) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }

      const range = max - min;
      for (let i = 0; i < firstBand.length; i++) {
        const value = firstBand[i];
        const color = value === noDataValue || range === 0 ? 0 : Math.round(((value - min) / range) * 255);
        dataArr[i * 4] = color;
        dataArr[i * 4 + 1] = color;
        dataArr[i * 4 + 2] = color;
        dataArr[i * 4 + 3] = value === noDataValue ? 0 : 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Create data object with explicit bands property
    const data = {
      url: canvas.toDataURL(),
      coordinates: wgs84Corners,
      bands: bandCount,
    };

    console.log(`=== MULTI BAND DATA CREATED ===`);
    console.log(`Band count being set: ${bandCount}`);
    console.log(`Data object:`, data);
    console.log(`Data bands property:`, data.bands);
    console.log(`Data keys:`, Object.keys(data));
    console.log(`==============================`);

    return [{ name: file.name, type: "raster", data }];
  }
};