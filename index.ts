
import type { Feature, FeatureCollection, BBox, Point } from 'geojson';

export type VectorLayerData = FeatureCollection;

export interface DemData {
  values: Float32Array;
  width: number;
  height: number;
  bbox: BBox;
  wgs84Bbox: BBox;
  noDataValue: number | null;
  projConverter?: (coords: [number, number]) => [number, number];
}

export interface RasterLayerData {
  url: string;
  coordinates: number[][];
  dem?: DemData;
}

export interface UserLayer {
  id: string;
  name: string;
  type: 'vector' | 'raster';
  data: VectorLayerData | RasterLayerData;
  visible: boolean;
  bbox?: BBox;
}

export type Tool = 'marker' | 'distance' | 'area' | 'comparison' | 'profile' | 'volume' | null;

export interface PanoHotspot {
  id: string;
  pitch: number;
  yaw: number;
  type: 'annotation' | 'issue';
  label: string;
  description?: string;
  status?: 'Open' | 'In Progress' | 'Resolved';
  responsible?: string;
}

export interface PanoImage {
  id: string;
  name: string;
  src: string; // data URL
  captureDate: string | null;
  location: Feature<Point>;
  annotationId: string;
  hotspots: PanoHotspot[];
}


export type VolumeCalcMethod = 'lowestPoint' | 'averagePerimeter' | 'bestFit' | 'fixedElevation';

export interface Annotation {
  id: string;
  feature: Feature;
  label: string;
  description: string;
  tags: string;
  visible: boolean;
  measurement: string;
  bbox?: BBox;
  panoImageId?: string;
  analysisResult?: {
    type: string;
    data: any;
    title: string;
  };
}
