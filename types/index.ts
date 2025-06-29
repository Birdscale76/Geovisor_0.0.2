// Fixed types/index.ts - Resolves declaration conflicts

import type { BBox, Feature, FeatureCollection, Point } from "geojson";

// Core layer types
export type LayerType = "vector" | "raster";

// DEM Data interface - consolidated to avoid conflicts
export interface DemData {
  values: Float32Array;
  width: number;
  height: number;
  bbox: BBox; // Use consistent BBox type
  wgs84Bbox: BBox;
  noDataValue?: number; // Use consistent optional number type
  projConverter?: (coords: [number, number]) => [number, number];
}

// Enhanced RasterLayerData interface with explicit classification
export interface RasterLayerData {
  url: string;
  coordinates: number[][];
  dem?: DemData;
  bands?: number; // Add this property
  rasterType?: 'elevation' | 'imagery'; // Add this property
}


// Vector layer data
export interface VectorLayerData extends FeatureCollection {
  // Inherits from GeoJSON FeatureCollection
}

// Base user layer interface
export interface UserLayer {
  id: string;
  name: string;
  type: LayerType;
  data: VectorLayerData | RasterLayerData;
  visible: boolean;
  bbox?: BBox;
}

// Tool types
export type Tool = 
  | "point"
  | "line" 
  | "polygon"
  | "marker"
  | "distance"
  | "area"
  | "volume"
  | "comparison"
  | "profile"
  | null;

// Annotation interface
export interface Annotation {
  id: string;
  feature: Feature;
  label: string;
  description: string;
  tags: string;
  visible: boolean;
  measurement: string;
  bbox?: BBox;
  analysisResult?: {
    type: string;
    data: any;
    title: string;
  };
  panoImageId?: string;
}

// Panoramic image interfaces
export interface PanoHotspot {
  id: string;
  type: "info" | "link";
  title: string;
  text?: string;
  url?: string;
  pitch: number;
  yaw: number;
}

export interface PanoImage {
  id: string;
  name: string;
  src: string;
  captureDate: string;
  location: Feature<Point>;
  annotationId: string;
  hotspots: PanoHotspot[];
}

// Volume calculation types
export type VolumeCalcMethod = "triangulation" | "fixed_elevation";

export interface VolumeData {
  net: number;
  fill: number;
  cut: number;
  area: number;
}

// Analysis result types
export interface AnalysisResult {
  type: string;
  data: any;
  title: string;
}

// Form data types
export interface AnnotationFormData {
  label: string;
  description?: string;
  tags?: string;
}

export interface HotspotFormData {
  type: "info" | "link";
  title: string;
  text?: string;
  url?: string;
}

// Pano data for dialog
export interface PanoData {
  file: File;
  locationMode: 'metadata' | 'new' | 'existing';
  existingAnnotationId?: string;
}

// Export commonly used GeoJSON types for convenience
export type { BBox, Feature, FeatureCollection, Point } from "geojson";