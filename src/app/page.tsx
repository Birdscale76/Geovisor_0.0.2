
"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type ReactElement } from "react";
import dynamic from "next/dynamic";
import Header from "@/app/components/header";
import LayersPanel from "@/app/components/layers-panel";
import MapContainer from "@/app/components/map-container";
import type {
  UserLayer,
  VectorLayerData,
  RasterLayerData,
  Tool,
  Annotation,
  PanoImage,
  PanoHotspot,
  VolumeCalcMethod,
} from "@/types";
import { v4 as uuidv4 } from "uuid";
import { calculateBbox } from "@/lib/geo-utils";
import { getVolumeFromDem } from "@/lib/geo-math";
import type { BBox, Feature, Point, Polygon } from "geojson";
import {
  AnnotationDialog,
  type AnnotationFormData,
} from "./components/annotation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewState } from "react-map-gl/maplibre";
import { useToast } from "@/hooks/use-toast";
import ExifReader from "exifreader";
import { readFileAsDataURL } from "@/lib/utils";
import AddPanoImageDialog, {
  type PanoData,
} from "./components/add-pano-image-dialog";
import HotspotDialog, { type HotspotFormData } from "./components/hotspot-dialog";
import AnalysisResultDialog from "./components/analysis-result-dialog";
import VolumeAnalysisDialog from "./components/volume-analysis-dialog";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { Button } from "@/components/ui/button";
import { Layers, Box, Rotate3d, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ComparisonMap = dynamic(() => import("./components/comparison-map"), {
  loading: () => <Skeleton className="h-full w-full" />,
  ssr: false,
});

const MapComponent = dynamic(() => import("./components/map-component"), {
  loading: () => <Skeleton className="h-full w-full" />,
  ssr: false,
});

const PannellumViewer = dynamic(
  () => import("./components/pannellum-viewer"),
  {
    loading: () => <Skeleton className="h-full w-full" />,
    ssr: false,
  }
);

type ViewMode = "2d" | "3d" | "360";
type AnalysisResult = {type: string, data: any, title: string};

const viewControls: {
  mode: ViewMode;
  icon: React.ElementType;
  label: string;
}[] = [
  { mode: "2d", icon: Layers, label: "2D View" },
  { mode: "3d", icon: Box, label: "3D View" },
  { mode: "360", icon: Rotate3d, label: "360 View" },
];

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [userLayers, setUserLayers] = useState<UserLayer[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [flyToBbox, setFlyToBbox] = useState<BBox | undefined>();
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [isBasemapVisible, setIsBasemapVisible] = useState(true);
  const [comparisonLayers, setComparisonLayers] = useState<
    [UserLayer, UserLayer] | null
  >(null);
  const [viewState, setViewState] = useState<Partial<ViewState>>({
    longitude: 82,
    latitude: 22,
    zoom: 4,
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnnotationDialogOpen, setIsAnnotationDialogOpen] = useState(false);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(true);

  // Volume analysis state
  const [isVolumeDialogOpen, setIsVolumeDialogOpen] = useState(false);
  const [pendingVolumeFeature, setPendingVolumeFeature] = useState<Feature<Polygon> | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{feature: Feature, measurement: string, analysisResult?: AnalysisResult} | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  // 360 View State
  const [panoImages, setPanoImages] = useState<PanoImage[]>([]);
  const [selectedPanoId, setSelectedPanoId] = useState<string | null>(null);
  const [isAddingPanoImage, setIsAddingPanoImage] = useState(false);
  const [isPickingPanoLocation, setIsPickingPanoLocation] = useState(false);
  const [pendingPanoFile, setPendingPanoFile] = useState<File | null>(null);
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [hotspotDialogState, setHotspotDialogState] = useState<{
    isOpen: boolean;
    data?: { pitch: number; yaw: number; };
  }>({ isOpen: false });


  const { toast } = useToast();

  const selectedPanoImage = useMemo(() => {
    return panoImages.find((p) => p.id === selectedPanoId) ?? null;
  }, [panoImages, selectedPanoId]);
  
  const canCompare = useMemo(() => {
    return (
      userLayers.filter((l) => l.type === "raster" && l.visible).length >= 2
    );
  }, [userLayers]);

  const hasDem = useMemo(() => {
    return userLayers.some(l => l.visible && l.type === 'raster' && (l.data as RasterLayerData).dem);
  }, [userLayers]);

  useEffect(() => {
    if (activeTool === "comparison" && canCompare) {
      const visibleRasterLayers = userLayers.filter(
        (l) => l.type === "raster" && l.visible
      );
      const layersToCompare = visibleRasterLayers.slice(-2);
      if (layersToCompare.length === 2) {
        setComparisonLayers(layersToCompare as [UserLayer, UserLayer]);
      }
    } else {
      setComparisonLayers(null);
    }
  }, [activeTool, userLayers, canCompare]);

  useEffect(() => {
    if (!canCompare && activeTool === "comparison") {
      setActiveTool(null);
    }
  }, [canCompare, activeTool]);

  const handleToolChange = (tool: Tool) => {
    if (activeTool === tool) {
      setActiveTool(null);
    } else {
      setActiveTool(tool);
    }
  };

  const addUserLayer = (
    layer: Omit<UserLayer, "id" | "visible">
  ): void => {
    const newLayer: UserLayer = {
      ...layer,
      id: uuidv4(),
      visible: true,
    };

    if (newLayer.type === "vector") {
      newLayer.bbox = calculateBbox(newLayer.data as VectorLayerData);
    } else if (newLayer.type === "raster") {
      const rasterData = newLayer.data as RasterLayerData;
      if (rasterData.dem) {
        newLayer.bbox = rasterData.dem.wgs84Bbox;
      } else {
        const coords = rasterData.coordinates;
        const minX = coords[0][0];
        const minY = coords[2][1];
        const maxX = coords[1][0];
        const maxY = coords[0][1];
        newLayer.bbox = [minX, minY, maxX, maxY];
      }
    }

    setUserLayers((prevLayers) => [...prevLayers, newLayer]);
    if (newLayer.bbox) {
      setFlyToBbox(newLayer.bbox);
    }
  };

  const toggleUserLayerVisibility = (id: string): void => {
    setUserLayers((prevLayers) =>
      prevLayers.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      )
    );
  };

  const deleteUserLayer = (id: string): void => {
    setUserLayers((prevLayers) =>
      prevLayers.filter((layer) => layer.id !== id)
    );
  };

  const zoomToLayer = (bbox: BBox | undefined): void => {
    if (bbox) {
      setFlyToBbox(bbox);
    }
  };

  const saveAnnotation = (
    feature: Feature,
    formData: AnnotationFormData,
    measurement: string,
    analysisResultData?: AnalysisResult
  ) => {
    const newAnnotation: Annotation = {
      id: uuidv4(),
      feature,
      label: formData.label,
      description: formData.description || "",
      tags: formData.tags || "",
      visible: true,
      measurement: measurement,
      bbox: calculateBbox({ type: "FeatureCollection", features: [feature] }),
      analysisResult: analysisResultData,
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
  };
  
  const handleAnnotationStart = useCallback((data: { feature: Feature; measurement: string; analysisResult?: AnalysisResult }) => {
    setPendingAnnotation(data);
    if (data.analysisResult) {
      // It's a profile or volume result, show preview first.
      setAnalysisResult({ ...data.analysisResult, title: "Analysis Preview" });
    } else {
      // It's a simple measurement, go straight to saving.
      setIsAnnotationDialogOpen(true);
    }
  }, []);

  const handleSaveFromPreview = () => {
    setAnalysisResult(null); // Close preview
    setIsAnnotationDialogOpen(true); // Open save dialog
  };

  const handleSaveAnnotation = (formData: AnnotationFormData) => {
    if (pendingAnnotation) {
      saveAnnotation(
        pendingAnnotation.feature,
        formData,
        pendingAnnotation.measurement,
        pendingAnnotation.analysisResult
      );
      if (pendingAnnotation.feature.id) {
         drawRef.current?.delete(pendingAnnotation.feature.id as string);
      }
      setPendingAnnotation(null);
      setIsAnnotationDialogOpen(false);
      setActiveTool(null);
    }
  };

  const handleCancelAnnotation = () => {
    if (pendingAnnotation && pendingAnnotation.feature.id) {
      drawRef.current?.delete(pendingAnnotation.feature.id as string);
    }
    setPendingAnnotation(null);
    setIsAnnotationDialogOpen(false);
    setActiveTool(null);
  };

  const toggleAnnotationVisibility = (id: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, visible: !a.visible } : a))
    );
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const zoomToAnnotation = (id: string) => {
    const annotation = annotations.find((a) => a.id === id);
    if (annotation?.bbox) {
      setFlyToBbox(annotation.bbox);
    }
  };

  const viewAnnotationAnalysis = (id: string) => {
    const annotation = annotations.find((a) => a.id === id);
    if (annotation?.analysisResult) {
      setAnalysisResult(annotation.analysisResult);
    }
  };

  const toggleBasemapVisibility = () => {
    setIsBasemapVisible((prev) => !prev);
  };

  // --- Volume Analysis Handlers ---
  const handleStartVolumeAnalysis = (feature: Feature<Polygon>) => {
    setPendingVolumeFeature(feature);
    setIsVolumeDialogOpen(true);
  };

  const handleCalculateVolume = (method: VolumeCalcMethod, options: { fixedElevation?: number }) => {
    const activeDem = userLayers.find(l => l.visible && l.type === 'raster' && (l.data as RasterLayerData).dem)?.data as RasterLayerData | undefined;
    const feature = pendingVolumeFeature;
    
    setIsVolumeDialogOpen(false);
    setPendingVolumeFeature(null);

    if (!feature || !activeDem?.dem) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not find active DEM layer.' });
      return;
    }
    
    const volumeData = getVolumeFromDem(feature, activeDem.dem, { method, ...options });

    if (volumeData) {
      const measurement = `Net Volume: ${volumeData.net.toFixed(2)} m³ (Fill: ${volumeData.fill.toFixed(2)}, Cut: ${volumeData.cut.toFixed(2)})`;
      const analysisResult = { type: 'volume', data: volumeData, title: 'Stockpile Volume Analysis' };
      handleAnnotationStart({ feature, measurement, analysisResult });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not calculate volume. The polygon may be outside the DEM extent.' });
      if (feature.id) {
        drawRef.current?.delete(feature.id as string);
      }
      handleToolChange(null);
    }
  };

  const handleCloseAnalysisPreview = () => {
    // If user closes preview dialog without saving
    if (pendingAnnotation) {
        if(pendingAnnotation.feature.id) {
            drawRef.current?.delete(pendingAnnotation.feature.id as string);
        }
        setPendingAnnotation(null);
        setActiveTool(null);
    }
    setAnalysisResult(null);
  };


  // --- 360 View Handlers ---

  const handleAddPanoAndAnnotation = useCallback(
    async (file: File, location: Point) => {
      const panoId = uuidv4();
      const annotationId = uuidv4();

      try {
        const src = await readFileAsDataURL(file);
        const tags = await ExifReader.load(file);
        const originalDateStr = tags.DateTimeOriginal?.description;
        const captureDate = originalDateStr
          ? new Date(originalDateStr.replace(':', '-').replace(':', '-')).toISOString()
          : new Date().toISOString();

        const newAnnotation: Annotation = {
          id: annotationId,
          feature: {
            type: 'Feature',
            geometry: location,
            properties: { name: file.name }
          },
          label: file.name,
          description: `360° image`,
          tags: "360,panorama",
          visible: true,
          measurement: `Image location`,
          bbox: [location.coordinates[0], location.coordinates[1], location.coordinates[0], location.coordinates[1]],
          panoImageId: panoId,
        };

        const newPanoImage: PanoImage = {
          id: panoId,
          name: file.name,
          src,
          captureDate,
          location: newAnnotation.feature as Feature<Point>,
          annotationId,
          hotspots: [],
        };
        
        setAnnotations(prev => [...prev, newAnnotation]);
        setPanoImages(prev => [...prev, newPanoImage]);
        setSelectedPanoId(panoId);
        setFlyToBbox(newAnnotation.bbox);
        toast({ title: "Success", description: "360° image added." });
      } catch (error) {
         console.error("Error adding pano image:", error);
         toast({ variant: 'destructive', title: "Error", description: "Could not process the panoramic image." });
      }
    }, [toast]
  );
  
  const handlePanoLocationPick = useCallback((coords: [number, number]) => {
    if (pendingPanoFile) {
      const location: Point = { type: 'Point', coordinates: coords };
      handleAddPanoAndAnnotation(pendingPanoFile, location);
    }
    setIsPickingPanoLocation(false);
    setPendingPanoFile(null);
  }, [pendingPanoFile, handleAddPanoAndAnnotation]);

  const handleStartPickingLocation = (file: File) => {
    setIsPickingPanoLocation(true);
    setPendingPanoFile(file);
    toast({ title: "Pick a location", description: "Click on the mini-map to place a marker for the image." });
  };
  
  const handleSavePano = useCallback(async (data: PanoData) => {
    if (data.locationMode === 'new') {
      handleStartPickingLocation(data.file);
      return;
    }

    let location: Point | null = null;
    if (data.locationMode === 'metadata') {
      try {
        const tags = await ExifReader.load(data.file);
        if (tags.GPSLatitude && tags.GPSLongitude) {
          const lat = tags.GPSLatitude.description * (tags.GPSLatitudeRef?.description === 'S' ? -1 : 1);
          const lon = tags.GPSLongitude.description * (tags.GPSLongitudeRef?.description === 'W' ? -1 : 1);
          location = { type: "Point", coordinates: [lon, lat] };
        }
      } catch(e) {
        console.error("Could not read EXIF for location", e);
      }
    } else if (data.locationMode === 'existing' && data.existingAnnotationId) {
      const existing = annotations.find(a => a.id === data.existingAnnotationId);
      if (existing && existing.feature.geometry.type === 'Point') {
        location = existing.feature.geometry;
      }
    }

    if (!location) {
      toast({ variant: 'destructive', title: "Error", description: "Could not determine location for the image." });
      return;
    }

    handleAddPanoAndAnnotation(data.file, location);
  }, [annotations, toast, handleAddPanoAndAnnotation]);

  const handleStartAddingHotspot = () => {
    setIsAddingHotspot(true);
    toast({
      title: "Adding Hotspot",
      description: "Click on the 360° image to place a marker.",
    });
  };

  const handleAddHotspot = (data: { pitch: number; yaw: number }) => {
    setIsAddingHotspot(false);
    setHotspotDialogState({ isOpen: true, data });
  };

  const handleSaveHotspot = (formData: HotspotFormData) => {
    if (!hotspotDialogState.data || !selectedPanoId) return;

    const newHotspot: PanoHotspot = {
      ...formData,
      id: uuidv4(),
      pitch: hotspotDialogState.data.pitch,
      yaw: hotspotDialogState.data.yaw,
    };

    setPanoImages(prev => prev.map(img => {
      if (img.id === selectedPanoId) {
        return {
          ...img,
          hotspots: [...img.hotspots, newHotspot]
        };
      }
      return img;
    }));

    setHotspotDialogState({ isOpen: false });
    toast({ title: "Success", description: "Hotspot added." });
  };

  return (
    <div className="flex h-screen w-full flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[350px] flex-col border-r bg-background">
          <Collapsible
            open={isLayersPanelOpen}
            onOpenChange={setIsLayersPanelOpen}
            className="flex flex-1 flex-col"
          >
            <div className="flex shrink-0 items-center justify-between border-b p-2">
              <div className="inline-flex gap-2 rounded-lg border bg-card p-2">
                {viewControls.map(({ mode, icon: Icon, label }) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode(mode)}
                    aria-label={label}
                    className="h-9 w-9"
                  >
                    <Icon className="h-5 w-5" />
                  </Button>
                ))}
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  {isLayersPanelOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                  <span className="sr-only">
                    {isLayersPanelOpen ? "Collapse panel" : "Expand panel"}
                  </span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="flex-1 overflow-y-auto">
              <div className="p-4">
                <LayersPanel
                  viewMode={viewMode}
                  userLayers={userLayers}
                  onAddLayer={addUserLayer}
                  onToggleLayerVisibility={toggleUserLayerVisibility}
                  onDeleteLayer={deleteUserLayer}
                  onZoomToLayer={zoomToLayer}
                  annotations={annotations}
                  onToggleAnnotationVisibility={toggleAnnotationVisibility}
                  onDeleteAnnotation={deleteAnnotation}
                  onZoomToAnnotation={zoomToAnnotation}
                  onViewAnnotationAnalysis={viewAnnotationAnalysis}
                  isBasemapVisible={isBasemapVisible}
                  onToggleBasemapVisibility={toggleBasemapVisibility}
                  panoImages={panoImages}
                  onAddPanoImage={() => setIsAddingPanoImage(true)}
                  onSelectPanoImage={setSelectedPanoId}
                  selectedPanoId={selectedPanoId}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div className="relative flex-1">
          {viewMode === "360" ? (
            <div className="relative h-full w-full">
              <PannellumViewer
                image={selectedPanoImage}
                onStartAddingHotspot={handleStartAddingHotspot}
                isAddingHotspot={isAddingHotspot}
                onAddHotspot={handleAddHotspot}
              />
              <div className="absolute bottom-4 left-4 z-10 h-1/4 min-h-[150px] w-1/3 min-w-[250px] max-w-[400px] overflow-hidden rounded-md border-2 border-card bg-background shadow-lg">
                <MapComponent
                  userLayers={[]}
                  annotations={annotations.map(a => ({...a, feature: {...a.feature, properties: {...a.feature.properties, isSelected: a.panoImageId === selectedPanoId }}}))}
                  viewState={viewState}
                  onViewStateChange={setViewState}
                  flyToBbox={flyToBbox}
                  activeTool={null}
                  onToolChange={() => {}}
                  isBasemapVisible={isBasemapVisible}
                  isPickingLocation={isPickingPanoLocation}
                  onLocationPick={handlePanoLocationPick}
                  onStartVolumeAnalysis={() => {}}
                  onDrawLoad={(draw) => { drawRef.current = draw; }}
                  onAnnotationStart={handleAnnotationStart}
                />
              </div>
            </div>
          ) : activeTool === "comparison" && comparisonLayers ? (
            <ComparisonMap
              leftLayer={comparisonLayers[0]}
              rightLayer={comparisonLayers[1]}
              userLayers={userLayers}
              annotations={annotations}
              flyToBbox={flyToBbox}
              viewState={viewState}
              onViewStateChange={setViewState}
              isBasemapVisible={isBasemapVisible}
            />
          ) : (
            <MapContainer
              viewMode={viewMode}
              setViewMode={setViewMode}
              userLayers={userLayers}
              flyToBbox={flyToBbox}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              annotations={annotations}
              onStartVolumeAnalysis={handleStartVolumeAnalysis}
              canCompare={canCompare}
              hasDem={hasDem}
              viewState={viewState}
              onViewStateChange={setViewState}
              isBasemapVisible={isBasemapVisible}
              onDrawLoad={(draw) => { drawRef.current = draw; }}
              onAnnotationStart={handleAnnotationStart}
            />
          )}
        </div>
      </div>
      <AddPanoImageDialog
        isOpen={isAddingPanoImage}
        onOpenChange={setIsAddingPanoImage}
        onSave={handleSavePano}
        onStartPickingLocation={handleStartPickingLocation}
        existingAnnotations={annotations}
      />
      {hotspotDialogState.data && (
        <HotspotDialog
          isOpen={hotspotDialogState.isOpen}
          onOpenChange={(open) => setHotspotDialogState({ isOpen: open })}
          onSave={handleSaveHotspot}
        />
      )}
       <VolumeAnalysisDialog
        isOpen={isVolumeDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && pendingVolumeFeature) {
            drawRef.current?.delete(pendingVolumeFeature.id as string);
            setPendingVolumeFeature(null);
            handleToolChange(null);
          }
          setIsVolumeDialogOpen(isOpen);
        }}
        onCalculate={handleCalculateVolume}
      />
      <AnalysisResultDialog
        result={analysisResult}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCloseAnalysisPreview();
        }}
        onSave={pendingAnnotation && analysisResult ? handleSaveFromPreview : undefined}
      />
      <AnnotationDialog
        isOpen={isAnnotationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelAnnotation();
          }
        }}
        measurement={pendingAnnotation?.measurement || ""}
        onSave={handleSaveAnnotation}
        onCancel={handleCancelAnnotation}
      />
    </div>
  );
}
