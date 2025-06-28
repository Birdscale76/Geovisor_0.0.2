
"use client";

import dynamic from "next/dynamic";
import MapControls from "@/app/components/map-controls";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserLayer, Tool, Annotation } from "@/types";
import type { BBox, Feature, Polygon } from "geojson";
import type { AnnotationFormData } from "./annotation-dialog";
import type { ViewState } from "react-map-gl/maplibre";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

const MapComponent = dynamic(() => import("./map-component"), {
  loading: () => <Skeleton className="h-full w-full" />,
  ssr: false,
});

type ViewMode = "2d" | "3d" | "360";

interface MapContainerProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  userLayers: UserLayer[];
  flyToBbox?: BBox;
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  annotations: Annotation[];
  onStartVolumeAnalysis: (feature: Feature<Polygon>) => void;
  canCompare: boolean;
  hasDem: boolean;
  viewState: Partial<ViewState>;
  onViewStateChange: (viewState: Partial<ViewState>) => void;
  isBasemapVisible: boolean;
  onDrawLoad: (draw: MapboxDraw) => void;
  onAnnotationStart: (data: { feature: Feature; measurement: string; analysisResult?: any }) => void;
}

export default function MapContainer({
  viewMode,
  setViewMode,
  userLayers,
  flyToBbox,
  activeTool,
  onToolChange,
  annotations,
  onStartVolumeAnalysis,
  canCompare,
  hasDem,
  viewState,
  onViewStateChange,
  isBasemapVisible,
  onDrawLoad,
  onAnnotationStart,
}: MapContainerProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background">
      <MapComponent
        userLayers={userLayers}
        flyToBbox={flyToBbox}
        activeTool={activeTool}
        onToolChange={onToolChange}
        annotations={annotations}
        onStartVolumeAnalysis={onStartVolumeAnalysis}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        isBasemapVisible={isBasemapVisible}
        onDrawLoad={onDrawLoad}
        onAnnotationStart={onAnnotationStart}
      />
      <MapControls
        activeTool={activeTool}
        onToolChange={onToolChange}
        canCompare={canCompare}
        hasDem={hasDem}
      />
    </div>
  );
}
