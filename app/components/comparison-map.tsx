
"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import Map, {
  Source,
  Layer,
  type MapRef,
  type ViewStateChangeEvent,
  type ViewState,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  UserLayer,
  RasterLayerData,
  Annotation,
  VectorLayerData,
} from "@/types";
import type { BBox, FeatureCollection } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import "./comparison-map.css";

interface ComparisonMapProps {
  leftLayer: UserLayer;
  rightLayer: UserLayer;
  userLayers: UserLayer[];
  annotations: Annotation[];
  flyToBbox?: BBox;
  viewState: Partial<ViewState>;
  onViewStateChange: (viewState: Partial<ViewState>) => void;
  isBasemapVisible: boolean;
}

const baseMapStyle: StyleSpecification = {
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
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-raster-layer",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export default function ComparisonMap({
  leftLayer,
  rightLayer,
  userLayers,
  annotations,
  flyToBbox,
  viewState,
  onViewStateChange,
  isBasemapVisible,
}: ComparisonMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<MapRef>(null);
  const rightMapRef = useRef<MapRef>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const rightMapContainerRef = useRef<HTMLDivElement>(null);
  const [leftMapLoaded, setLeftMapLoaded] = useState(false);
  const [rightMapLoaded, setRightMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      // only sync on user interaction to prevent infinite loop
      if (evt.originalEvent) {
        onViewStateChange(evt.viewState);
      }
    },
    [onViewStateChange]
  );

  // Handle map errors
  const handleMapError = useCallback((error: any) => {
    console.warn("Map error (non-critical):", error);
    if (!error.message?.includes("Failed to fetch")) {
      setError(`Map error: ${error.message || "Unknown error"}`);
    }
  }, []);

  // Handle slider logic
  useEffect(() => {
    const container = containerRef.current;
    const slider = sliderRef.current;
    const rightMapContainer = rightMapContainerRef.current;
    if (!container || !slider || !rightMapContainer) return;

    let isDragging = false;

    const moveSlider = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      let x = clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));

      slider.style.left = `${x}px`;
      rightMapContainer.style.clipPath = `polygon(${x}px 0, 100% 0, 100% 100%, ${x}px 100%)`;
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) moveSlider(e.clientX);
    };

    const onMouseUp = () => {
      isDragging = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    const onTouchStart = (e: TouchEvent) => {
      isDragging = true;
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", onTouchEnd);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) moveSlider(e.touches[0].clientX);
    };

    const onTouchEnd = () => {
      isDragging = false;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };

    slider.addEventListener("mousedown", onMouseDown);
    slider.addEventListener("touchstart", onTouchStart, { passive: true });

    // Set initial position after a short delay to ensure container is sized
    const timer = setTimeout(() => {
      const initialX = container.clientWidth / 2;
      moveSlider(container.getBoundingClientRect().left + initialX);
    }, 100);

    return () => {
      clearTimeout(timer);
      slider.removeEventListener("mousedown", onMouseDown);
      slider.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    const setVisibilityForMap = (mapRef: React.RefObject<MapRef>) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      
      const setVisibility = () => {
        try {
          if (map.getLayer("osm-raster-layer")) {
            map.setLayoutProperty(
              "osm-raster-layer",
              "visibility",
              isBasemapVisible ? "visible" : "none"
            );
          }
        } catch (error) {
          console.warn("Error setting layer visibility:", error);
        }
      };

      if (map.isStyleLoaded()) {
        setVisibility();
      } else {
        map.once("load", setVisibility);
      }
    };

    if (leftMapLoaded) setVisibilityForMap(leftMapRef);
    if (rightMapLoaded) setVisibilityForMap(rightMapRef);
  }, [isBasemapVisible, leftMapLoaded, rightMapLoaded]);

  // Handle flyTo when bbox changes - removed automatic flying
  useEffect(() => {
    if (!flyToBbox) return;
    // The view state is now controlled from the parent, so we don't
    // need to fly here automatically, which was resetting the view.
  }, [flyToBbox]);

  const renderRasterLayer = (layer: UserLayer) => {
    if (!layer || !layer.data) return null;
    
    try {
      return (
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
            paint={{ "raster-opacity": 1 }}
          />
        </Source>
      );
    } catch (error) {
      console.warn("Error rendering raster layer:", error);
      return null;
    }
  };

  const renderAdditionalLayers = (idPrefix: string = "") => (
    <>
      {/* User-loaded VECTOR layers */}
      {userLayers
        .filter((l) => l.type === "vector")
        .map((layer) => (
          <Source
            key={`${idPrefix}${layer.id}`}
            id={`${idPrefix}${layer.id}`}
            type="geojson"
            data={layer.data as VectorLayerData}
          >
            <Layer
              id={`${idPrefix}${layer.id}-fill`}
              type="fill"
              paint={{
                "fill-color": "#3182CE",
                "fill-opacity": 0.6,
              }}
              filter={["==", "$type", "Polygon"]}
              layout={{ visibility: layer.visible ? "visible" : "none" }}
            />
            <Layer
              id={`${idPrefix}${layer.id}-line`}
              type="line"
              paint={{
                "line-color": "#1A365D",
                "line-width": 3,
              }}
              filter={["any", ["==", "$type", "Polygon"], ["==", "$type", "LineString"]]}
              layout={{ visibility: layer.visible ? "visible" : "none" }}
            />
            <Layer
              id={`${idPrefix}${layer.id}-point`}
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
        id={`${idPrefix}annotations-polygons`}
        type="geojson"
        data={annotationPolygons}
      >
        <Layer
          id={`${idPrefix}annotations-polygons-fill`}
          type="fill"
          paint={{ "fill-color": "#fbb03b", "fill-opacity": 0.2 }}
        />
        <Layer
          id={`${idPrefix}annotations-polygons-stroke`}
          type="line"
          paint={{ "line-color": "#fbb03b", "line-width": 3 }}
        />
      </Source>
      <Source id={`${idPrefix}annotations-lines`} type="geojson" data={annotationLines}>
        <Layer
          id={`${idPrefix}annotations-lines-stroke`}
          type="line"
          paint={{ "line-color": "#fbb03b", "line-width": 3 }}
        />
      </Source>
      <Source id={`${idPrefix}annotations-points`} type="geojson" data={annotationPoints}>
        <Layer
          id={`${idPrefix}annotations-points-circle`}
          type="circle"
          paint={{
            "circle-radius": 7,
            "circle-color": "#fbb03b",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          }}
        />
      </Source>
    </>
  );

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Map Error</p>
          <p className="text-sm text-gray-600">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Base Map (Left) */}
      <Map
        id="left-map"
        ref={leftMapRef}
        {...viewState}
        onMove={onMove}
        onLoad={() => setLeftMapLoaded(true)}
        onError={handleMapError}
        mapStyle={JSON.parse(JSON.stringify(baseMapStyle))}
        maxZoom={23}
        reuseMaps={true}
      >
        {leftMapLoaded && renderRasterLayer(leftLayer)}
        {leftMapLoaded && renderAdditionalLayers()}
      </Map>

      {/* Clipped Map (Right) */}
      <div
        ref={rightMapContainerRef}
        className="absolute top-0 left-0 h-full w-full"
      >
        <Map
          id="right-map"
          ref={rightMapRef}
          {...viewState}
          onMove={onMove}
          onLoad={() => setRightMapLoaded(true)}
          onError={handleMapError}
          mapStyle={JSON.parse(JSON.stringify(baseMapStyle))}
          maxZoom={23}
          reuseMaps={true}
        >
          {rightMapLoaded && renderRasterLayer(rightLayer)}
          {rightMapLoaded && renderAdditionalLayers("right-")}
        </Map>
      </div>
      
      <div ref={sliderRef} className="comparison-slider" />
      
      {/* Loading indicator */}
      {(!leftMapLoaded || !rightMapLoaded) && (
        <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded shadow text-sm">
          Loading maps...
        </div>
      )}
    </div>
  );
}
