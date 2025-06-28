"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import Map, {
  Source,
  Layer,
  Marker,
  useMap,
  MapRef,
} from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { Camera, MapPin } from "lucide-react";
import type { 
  UserLayer, 
  Tool, 
  Annotation, 
  PanoImage,
  VectorLayerData,
  RasterLayerData 
} from "@/types";
import type { BBox, Feature, Polygon, LineString, Point } from "geojson";
import type { ViewState } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";

// Simple geometry calculation functions (replacing turf)
const calculateArea = (coordinates: number[][][]): number => {
  // Simplified area calculation for polygon
  const ring = coordinates[0];
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]);
  }
  return Math.abs(area / 2);
};

const calculateLength = (coordinates: number[][]): number => {
  // Simplified length calculation for linestring
  let length = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    length += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 111320; // rough meters conversion
  }
  return length;
};

// Define proper control interface for MapLibre
interface MapLibreControl {
  onAdd(map: MapLibreMap): HTMLElement;
  onRemove(map: MapLibreMap): void;
}

// MapLibre-compatible Draw control wrapper
class MapLibreDrawControl implements MapLibreControl {
  public draw: MapboxDraw;

  constructor(options?: any) {
    this.draw = new MapboxDraw(options);
  }

  onAdd(map: MapLibreMap): HTMLElement {
    // Type assertion to work around the incompatibility
    return this.draw.onAdd(map as any);
  }

  onRemove(map: MapLibreMap): void {
    // Type assertion to work around the incompatibility
    this.draw.onRemove(map as any);
  }

  // Delegate all methods to the underlying draw instance
  add = (feature: any) => this.draw.add(feature);
  get = (id: string) => this.draw.get(id);
  getFeatureIdsAt = (point: any) => this.draw.getFeatureIdsAt(point);
  getSelectedIds = () => this.draw.getSelectedIds();
  getSelected = () => this.draw.getSelected();
  getAll = () => this.draw.getAll();
  delete = (ids: string | string[]) => this.draw.delete(ids);
  deleteAll = () => this.draw.deleteAll();
  set = (featureCollection: any) => this.draw.set(featureCollection);
  trash = () => this.draw.trash();
  combineFeatures = () => this.draw.combineFeatures();
  uncombineFeatures = () => this.draw.uncombineFeatures();
  changeMode = (mode: string, options?: any) => this.draw.changeMode(mode, options);
  getMode = () => this.draw.getMode();
}

interface MapComponentProps {
  userLayers: UserLayer[];
  flyToBbox?: BBox;
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  annotations: Annotation[];
  onStartVolumeAnalysis: (feature: Feature<Polygon>) => void;
  viewState: Partial<ViewState>;
  onViewStateChange: (viewState: Partial<ViewState>) => void;
  isBasemapVisible: boolean;
  onDrawLoad: (draw: MapboxDraw) => void;
  onAnnotationStart: (data: { feature: Feature; measurement: string; analysisResult?: any }) => void;
  onPanoMarkerClick: (panoId: string) => void;
  isPickingLocation?: boolean;
  onLocationPick?: (coords: [number, number]) => void;
  panoImages?: PanoImage[];
  selectedPanoId?: string | null;
}

export default function MapComponent({
  userLayers,
  flyToBbox,
  activeTool,
  onToolChange,
  annotations,
  onStartVolumeAnalysis,
  viewState,
  onViewStateChange,
  isBasemapVisible,
  onDrawLoad,
  onAnnotationStart,
  onPanoMarkerClick,
  isPickingLocation,
  onLocationPick,
  panoImages = [],
  selectedPanoId,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null);
  const drawControlRef = useRef<MapLibreDrawControl | null>(null);
  const currentToolRef = useRef<Tool>(activeTool);

  // Update current tool ref
  useEffect(() => {
    currentToolRef.current = activeTool;
  }, [activeTool]);

  // Fly to bbox effect
  useEffect(() => {
    if (flyToBbox && mapRef.current) {
      const map = mapRef.current.getMap();
      const [minX, minY, maxX, maxY] = flyToBbox;
      
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        {
          padding: 50,
          duration: 1000,
        }
      );
    }
  }, [flyToBbox]);

  // Calculate measurement for different geometry types
  const calculateMeasurement = useCallback((feature: Feature): string => {
    const geom = feature.geometry;
    
    switch (geom.type) {
      case "Point":
        const [lon, lat] = geom.coordinates;
        return `Location: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      
      case "LineString":
        const lineLength = calculateLength(geom.coordinates);
        return `Length: ${lineLength.toFixed(2)} m`;
      
      case "Polygon":
        const polygonArea = calculateArea(geom.coordinates);
        return `Area: ${(polygonArea * 111320 * 111320 / 10000).toFixed(2)} ha`; // rough conversion
      
      default:
        return "Unknown geometry";
    }
  }, []);

  // Handle draw events
  const handleDrawCreate = useCallback((e: any) => {
    const feature = e.features[0];
    if (!feature) return;

    const measurement = calculateMeasurement(feature);

    if (currentToolRef.current === "volume" && feature.geometry.type === "Polygon") {
      onStartVolumeAnalysis(feature);
    } else {
      onAnnotationStart({ feature, measurement });
    }
  }, [calculateMeasurement, onStartVolumeAnalysis, onAnnotationStart]);

  // Handle map click for location picking
  const handleMapClick = useCallback((event: any) => {
    if (isPickingLocation && onLocationPick) {
      const { lng, lat } = event.lngLat;
      onLocationPick([lng, lat]);
    }
  }, [isPickingLocation, onLocationPick]);

  // Handle map load
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Initialize draw control
    if (!drawControlRef.current) {
      drawControlRef.current = new MapLibreDrawControl({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          line_string: true,
          point: true,
          trash: true,
        },
        styles: [
          // Point style
          {
            id: "gl-draw-point",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["!=", "mode", "static"]],
            paint: {
              "circle-radius": 6,
              "circle-color": "#3b82f6",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          },
          // Line style
          {
            id: "gl-draw-line",
            type: "line",
            filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#3b82f6",
              "line-width": 3,
            },
          },
          // Polygon fill
          {
            id: "gl-draw-polygon-fill",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            paint: {
              "fill-color": "#3b82f6",
              "fill-opacity": 0.3,
            },
          },
          // Polygon stroke
          {
            id: "gl-draw-polygon-stroke",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#3b82f6",
              "line-width": 2,
            },
          },
        ],
      });

      // Type assertion for MapLibre compatibility
      map.addControl(drawControlRef.current as any);
      // Pass the underlying MapboxDraw instance to the callback
      onDrawLoad(drawControlRef.current.draw);

      // Add event listeners
      map.on("draw.create", handleDrawCreate);
    }
  }, [onDrawLoad, handleDrawCreate]);

  // Handle tool changes
  useEffect(() => {
    if (!drawControlRef.current) return;

    const draw = drawControlRef.current;

    switch (activeTool) {
      case "point" as Tool:
        draw.changeMode("draw_point");
        break;
      case "line" as Tool:
        draw.changeMode("draw_line_string");
        break;
      case "polygon" as Tool:
      case "volume" as Tool:
        draw.changeMode("draw_polygon");
        break;
      case "marker" as Tool:
        draw.changeMode("draw_point");
        break;
      case "distance" as Tool:
        draw.changeMode("draw_line_string");
        break;
      case "area" as Tool:
        draw.changeMode("draw_polygon");
        break;
      case "comparison" as Tool:
      case "profile" as Tool:
      case null:
      default:
        draw.changeMode("simple_select");
        break;
    }
  }, [activeTool]);

  // Generate layer sources and layers for user data
  const layerSources = useMemo(() => {
    const sources: { [key: string]: any } = {};
    const layers: LayerProps[] = [];

    userLayers.forEach((layer) => {
      if (!layer.visible) return;

      if (layer.type === "vector") {
        const data = layer.data as VectorLayerData;
        sources[layer.id] = {
          type: "geojson",
          data,
        };

        // Add different styles based on geometry type
        data.features.forEach((feature, index) => {
          const layerId = `${layer.id}-${index}`;
          
          if (feature.geometry.type === "Point") {
            layers.push({
              id: layerId,
              type: "circle",
              source: layer.id,
              filter: ["==", ["get", "id"], feature.id || index],
              paint: {
                "circle-radius": 6,
                "circle-color": "#ef4444",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
            });
          } else if (feature.geometry.type === "LineString") {
            layers.push({
              id: layerId,
              type: "line",
              source: layer.id,
              filter: ["==", ["get", "id"], feature.id || index],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#ef4444",
                "line-width": 3,
              },
            });
          } else if (feature.geometry.type === "Polygon") {
            // Polygon fill
            layers.push({
              id: `${layerId}-fill`,
              type: "fill",
              source: layer.id,
              filter: ["==", ["get", "id"], feature.id || index],
              paint: {
                "fill-color": "#ef4444",
                "fill-opacity": 0.3,
              },
            });
            // Polygon stroke
            layers.push({
              id: `${layerId}-stroke`,
              type: "line",
              source: layer.id,
              filter: ["==", ["get", "id"], feature.id || index],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#ef4444",
                "line-width": 2,
              },
            });
          }
        });
      } else if (layer.type === "raster") {
        const data = layer.data as RasterLayerData;
        sources[layer.id] = {
          type: "raster",
          tiles: [data.url],
          tileSize: 256,
        };

        layers.push({
          id: layer.id,
          type: "raster",
          source: layer.id,
          paint: {
            "raster-opacity": 0.8,
          },
        });
      }
    });

    return { sources, layers };
  }, [userLayers]);

  // Filter annotations for regular markers and pano markers
  const regularAnnotations = annotations.filter(a => !a.panoImageId && a.visible);
  const panoAnnotations = annotations.filter(a => a.panoImageId && a.visible);

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => onViewStateChange(evt.viewState)}
      onLoad={handleMapLoad}
      onClick={handleMapClick}
      style={{ width: "100%", height: "100%" }}
      mapStyle={
        isBasemapVisible
          ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          : {
              version: 8,
              sources: {},
              layers: [
                {
                  id: "background",
                  type: "background",
                  paint: {
                    "background-color": "#f8f9fa",
                  },
                },
              ],
            }
      }
      cursor={isPickingLocation ? "crosshair" : "default"}
    >
      {/* Render user layer sources and layers */}
      {Object.entries(layerSources.sources).map(([id, source]) => (
        <Source key={id} id={id} {...source} />
      ))}
      
      {layerSources.layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}

      {/* Render regular annotation markers */}
      {regularAnnotations.map((annotation) => {
        if (annotation.feature.geometry.type !== "Point") return null;

        const [longitude, latitude] = annotation.feature.geometry.coordinates;

        return (
          <Marker
            key={`annotation-${annotation.id}`}
            longitude={longitude}
            latitude={latitude}
          >
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white shadow-lg"
              title={annotation.label}
            >
              <MapPin className="h-3 w-3" />
            </div>
          </Marker>
        );
      })}

      {/* Render panoramic image markers */}
      {panoAnnotations.map((annotation) => {
        if (annotation.feature.geometry.type !== "Point") return null;

        const [longitude, latitude] = annotation.feature.geometry.coordinates;
        const isSelected = annotation.panoImageId === selectedPanoId;

        return (
          <Marker
            key={`pano-${annotation.id}`}
            longitude={longitude}
            latitude={latitude}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              if (annotation.panoImageId) {
                onPanoMarkerClick(annotation.panoImageId);
              }
            }}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-blue-500 text-white shadow-lg transition-all hover:scale-110 cursor-pointer ${
                isSelected
                  ? "border-yellow-400 ring-2 ring-yellow-400"
                  : "border-white"
              }`}
              title={annotation.label}
            >
              <Camera className="h-4 w-4" />
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}