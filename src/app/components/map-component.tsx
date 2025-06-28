
"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import Map, {
  Source,
  Layer,
  useControl,
  type MapRef,
  type MapLayerMouseEvent,
  type ViewState,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  UserLayer,
  VectorLayerData,
  RasterLayerData,
  Tool,
  Annotation,
  DemData,
} from "@/types";
import type { BBox, Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import * as turf from '@turf/turf';
import {
  calculateLineDistance,
  calculatePolygonArea,
  formatDistance,
  formatArea,
  getElevationForPoint,
  getProfileFromDem,
} from "@/lib/geo-math";
import { useToast } from "@/hooks/use-toast";

const drawStyles: object[] = [
  // Polygon fill
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-color": "#fbb03b", // Orange-yellow
      "fill-opacity": 0.2,
    },
  },
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#fbb03b",
      "fill-opacity": 0.2,
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  // Polygon stroke
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  // Line stroke
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line-active",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "active", "true"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  // Vertices
  {
    id: "gl-draw-polygon-and-line-vertex-stroke-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "meta", "vertex"],
      ["==", "$type", "Point"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "meta", "vertex"],
      ["==", "$type", "Point"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  // Points
  {
    id: "gl-draw-point-point-stroke-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 7,
      "circle-opacity": 1,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fbb03b", // Orange-yellow
    },
  },
  {
    id: "gl-draw-point-stroke-active",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "active", "true"],
      ["!=", "meta", "midpoint"],
    ],
    paint: {
      "circle-radius": 9,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["!=", "meta", "midpoint"],
      ["==", "active", "true"],
    ],
    paint: {
      "circle-radius": 7,
      "circle-color": "#fbb03b",
    },
  },
  // Static mode
  {
    id: "gl-draw-polygon-fill-static",
    type: "fill",
    filter: ["all", ["==", "mode", "static"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#fbb03b",
      "fill-outline-color": "#fbb03b",
      "fill-opacity": 0.2,
    },
  },
  {
    id: "gl-draw-polygon-stroke-static",
    type: "line",
    filter: ["all", ["==", "mode", "static"], ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line-static",
    type: "line",
    filter: ["all", ["==", "mode", "static"], ["==", "$type", "LineString"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-point-static",
    type: "circle",
    filter: ["all", ["==", "mode", "static"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 7,
      "circle-color": "#fbb03b",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  },
];

interface DrawControlProps {
  onLoad: (draw: MapboxDraw) => void;
  onCreate: (evt: { features: Feature[] }) => void;
  onUpdate: (evt: { features: Feature[]; action: string }) => void;
}

function DrawControl({ onLoad, onCreate, onUpdate }: DrawControlProps) {
  const onCreateRef = useRef(onCreate);
  onCreateRef.current = onCreate;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useControl<MapboxDraw>(
    () => {
      const drawInstance = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          point: false,
          line_string: false,
          polygon: false,
          trash: false,
        },
        defaultMode: "simple_select",
        styles: drawStyles,
      });

      const originalOnAdd = drawInstance.onAdd;
      const originalOnRemove = drawInstance.onRemove;

      drawInstance.onAdd = (map: MapLibreMap) => {
        const addedControl = originalOnAdd.call(drawInstance, map);
        map.on("draw.create", (evt) => onCreateRef.current(evt as any));
        map.on("draw.update", (evt) => onUpdateRef.current(evt as any));
        onLoad(drawInstance);
        return addedControl;
      };
      
      drawInstance.onRemove = (map: MapLibreMap) => {
        map.off("draw.create", (evt) => onCreateRef.current(evt as any));
        map.off("draw.update", (evt) => onUpdateRef.current(evt as any));
        originalOnRemove.call(drawInstance, map);
      };

      return drawInstance as any;
    },
    {
      position: "top-left",
    }
  );

  return null;
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
  isPickingLocation?: boolean;
  onLocationPick?: (coords: [number, number]) => void;
  onDrawLoad: (draw: MapboxDraw) => void;
  onAnnotationStart: (data: { feature: Feature; measurement: string; analysisResult?: any }) => void;
}

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19, // Limit OSM tiles to zoom 19
    },
  },
  layers: [
    {
      id: "osm-raster-layer",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 19, // OSM layer stops at zoom 19
    },
  ],
};

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
  isPickingLocation = false,
  onLocationPick,
  onDrawLoad,
  onAnnotationStart,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const { toast } = useToast();

  const activeToolRef = useRef(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  const activeDemLayer = useMemo(() => {
    return userLayers.find(l => l.visible && l.type === 'raster' && (l.data as RasterLayerData).dem) as UserLayer | undefined;
  }, [userLayers]);
  const activeDemLayerRef = useRef(activeDemLayer);
  useEffect(() => {
    activeDemLayerRef.current = activeDemLayer;
  }, [activeDemLayer]);


  const onMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (isPickingLocation && onLocationPick) {
        onLocationPick([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      if (activeToolRef.current) return;
      const features = e.features;
      if (features && features.length > 0) {
        console.log("Clicked features:", features);
      }
    },
    [isPickingLocation, onLocationPick]
  );

  useEffect(() => {
    if (flyToBbox && mapRef.current) {
      const [minX, minY, maxX, maxY] = flyToBbox;

      if (minX === maxX && minY === maxY) {
        mapRef.current.flyTo({ center: [minX, minY], zoom: 14, duration: 1000 });
      } else {
        mapRef.current.fitBounds(
          [
            [minX, minY],
            [maxX, maxY],
          ],
          { padding: 80, duration: 1000 }
        );
      }
    }
  }, [flyToBbox]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || isPickingLocation) return;

    const modeMap = {
      marker: "draw_point",
      distance: "draw_line_string",
      area: "draw_polygon",
      profile: "draw_line_string",
      volume: "draw_polygon",
    };

    const targetMode =
      activeTool && activeTool !== "comparison"
        ? modeMap[activeTool]
        : "simple_select";

    if (draw.getMode() !== targetMode) {
      draw.changeMode(targetMode);
    }
  }, [activeTool, isPickingLocation]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const setVisibility = () => {
      if (map.getLayer("osm-raster-layer")) {
        map.setLayoutProperty(
          "osm-raster-layer",
          "visibility",
          isBasemapVisible ? "visible" : "none"
        );
      }
    };

    if (map.isStyleLoaded()) {
      setVisibility();
    } else {
      map.once("load", setVisibility);
    }
  }, [isBasemapVisible]);

  const onCreateOrUpdate = useCallback((e: { features: Feature[] }) => {
    const feature = e.features[0];
    if (!feature?.geometry) return;
    
    if (feature.geometry.type === 'Polygon') {
        feature.bbox = turf.bbox(feature);
    }

    let text = "";
    const demData = activeDemLayerRef.current?.data as RasterLayerData | undefined;

    switch (activeToolRef.current) {
      case "marker": {
        const coords = (feature.geometry as Point).coordinates;
        text = `Marker at ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
        if (demData?.dem) {
          const elevation = getElevationForPoint(coords[0], coords[1], demData.dem);
          if (elevation !== null) {
            text += `\nElevation: ${elevation.toFixed(2)} m`;
          }
        }
        onAnnotationStart({ feature, measurement: text });
        break;
      }
      case "distance": {
        const distance = calculateLineDistance((feature.geometry as LineString).coordinates);
        text = `Length: ${formatDistance(distance)}`;
        onAnnotationStart({ feature, measurement: text });
        break;
      }
      case "area": {
        const area = calculatePolygonArea((feature.geometry as Polygon).coordinates[0]);
        text = `Area: ${formatArea(area)}`;
        onAnnotationStart({ feature, measurement: text });
        break;
      }
      case "profile": {
        if (!demData?.dem) {
          toast({ variant: 'destructive', title: 'Error', description: 'No active DEM layer for profile analysis.' });
          return;
        }
        const profileData = getProfileFromDem(feature as Feature<LineString>, demData.dem);
        if (profileData) {
          const distance = calculateLineDistance((feature.geometry as LineString).coordinates);
          const measurement = `Profile: ${formatDistance(distance)}`;
          const analysisResult = { type: 'profile', data: profileData, title: 'Elevation Profile' };
          onAnnotationStart({ feature, measurement, analysisResult });
        } else {
          drawRef.current?.delete(feature.id as string);
          onToolChange(null);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not generate profile. The line may be outside the DEM extent.' });
        }
        break;
      }
      case "volume": {
        if (!demData?.dem) {
          toast({ variant: 'destructive', title: 'Error', description: 'No active DEM layer for volume analysis.' });
          return;
        }
        onStartVolumeAnalysis(feature as Feature<Polygon>);
        break;
      }
    }
  }, [onToolChange, toast, onStartVolumeAnalysis, onAnnotationStart]);

  const annotationPoints = useMemo(
    () => ({
      type: "FeatureCollection",
      features: annotations
        .filter((a) => a.visible && a.feature.geometry.type === "Point")
        .map((a) => a.feature),
    }),
    [annotations]
  ) as FeatureCollection;

  const annotationLines = useMemo(
    () => ({
      type: "FeatureCollection",
      features: annotations
        .filter((a) => a.visible && a.feature.geometry.type === "LineString")
        .map((a) => a.feature),
    }),
    [annotations]
  ) as FeatureCollection;

  const annotationPolygons = useMemo(
    () => ({
      type: "FeatureCollection",
      features: annotations
        .filter((a) => a.visible && a.feature.geometry.type === "Polygon")
        .map((a) => a.feature),
    }),
    [annotations]
  ) as FeatureCollection;

  const getCursor = () => {
    if (isPickingLocation) return "crosshair";
    if (activeTool && activeTool !== "comparison") return "crosshair";
    return "grab";
  }

  return (
    <>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => onViewStateChange(evt.viewState)}
        style={{ width: "100%", height: "100%", zIndex: 0 }}
        mapStyle={mapStyle}
        interactiveLayerIds={userLayers
          .filter((l) => l.visible && l.type === "vector")
          .flatMap((l) => [
            `${l.id}-fill`,
            `${l.id}-line`,
            `${l.id}-point`,
          ])}
        onClick={onMapClick}
        doubleClickZoom={!activeTool && !isPickingLocation}
        cursor={getCursor()}
        maxZoom={23}
      >
        {/* User-loaded RASTER layers (render first, so they appear at bottom) */}
        {userLayers
          .filter((l) => l.type === "raster")
          .map((layer) => (
            <Source
              key={layer.id}
              id={layer.id}
              type="image"
              url={(layer.data as RasterLayerData).url}
              coordinates={
                (layer.data as RasterLayerData).coordinates as unknown as [
                  [number, number],
                  [number, number],
                  [number, number],
                  [number, number]
                ]
              }
            >
              <Layer
                id={`${layer.id}-raster`}
                type="raster"
                paint={{ "raster-opacity": 0.85 }}
                layout={{ visibility: layer.visible ? "visible" : "none" }}
              />
            </Source>
          ))}

        {/* User-loaded VECTOR layers (render after rasters, so they appear on top) */}
        {userLayers
          .filter((l) => l.type === "vector")
          .map((layer) => (
            <Source
              key={layer.id}
              id={layer.id}
              type="geojson"
              data={layer.data as VectorLayerData}
            >
              {/* Fill Layer - Renders underneath the line */}
              <Layer
                id={`${layer.id}-fill`}
                type="fill"
                paint={{
                  "fill-color": "#3182CE",
                  "fill-opacity": 0.6,
                }}
                filter={["==", "$type", "Polygon"]}
                layout={{ visibility: layer.visible ? "visible" : "none" }}
              />
              {/* Line Layer - Renders on top of the fill */}
              <Layer
                id={`${layer.id}-line`}
                type="line"
                paint={{
                  "line-color": "#1A365D",
                  "line-width": 3,
                }}
                filter={[
                  "any",
                  ["==", "$type", "Polygon"],
                  ["==", "$type", "LineString"],
                ]}
                layout={{ visibility: layer.visible ? "visible" : "none" }}
              />
              {/* Point Layer - Renders on top of lines and fills */}
              <Layer
                id={`${layer.id}-point`}
                type="circle"
                paint={{
                  "circle-radius": 6,
                  "circle-color": "#1A365D",
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 2,
                }}
                filter={["==", "$type", "Point"]}
                layout={{ visibility: layer.visible ? "visible" : "none" }}
              />
            </Source>
          ))}

        {/* Saved Annotations (rendered on top of everything) */}
        <Source
          id="annotations-polygons"
          type="geojson"
          data={annotationPolygons}
        >
          <Layer
            id="annotations-polygons-fill"
            type="fill"
            paint={{ "fill-color": "#fbb03b", "fill-opacity": 0.2 }}
          />
          <Layer
            id="annotations-polygons-stroke"
            type="line"
            paint={{ "line-color": "#fbb03b", "line-width": 3 }}
          />
        </Source>
        <Source id="annotations-lines" type="geojson" data={annotationLines}>
          <Layer
            id="annotations-lines-stroke"
            type="line"
            paint={{ "line-color": "#fbb03b", "line-width": 3 }}
          />
        </Source>
        <Source id="annotations-points" type="geojson" data={annotationPoints}>
          <Layer
            id="annotations-points-circle"
            type="circle"
            paint={{
              "circle-radius": 7,
              "circle-color": "#fbb03b",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
            }}
          />
        </Source>

        <DrawControl
          onLoad={(draw) => {
            drawRef.current = draw;
            onDrawLoad(draw);
          }}
          onCreate={onCreateOrUpdate}
          onUpdate={onCreateOrUpdate}
        />
      </Map>
    </>
  );
}
