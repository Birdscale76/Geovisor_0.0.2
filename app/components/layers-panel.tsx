"use client";

import { useRef, useCallback, useMemo } from "react";
import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Layers,
  Box,
  Image as ImageIcon,
  PenSquare,
  Plus,
  FileJson,
  Wind,
  Globe,
  FileImage,
  ZoomIn,
  Trash2,
  MapPin,
  Ruler,
  Scaling,
  Camera,
  Info,
  Mountain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { UserLayer, Annotation, PanoImage, RasterLayerData, VectorLayerData } from "@/types";
import {
  parseGeoJSON,
  parseKMLOrKMZ,
  parseShapefile,
  parseGeoTIFF,
} from "@/lib/file-parsers";
import type { BBox } from "geojson";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { format, parseISO } from "date-fns";

const modelLayers = [
  { id: "city-model", name: "CityGML Model", checked: true },
];

type ViewMode = "2d" | "3d" | "360";

interface LayersPanelProps {
  viewMode: ViewMode;
  userLayers: UserLayer[];
  onAddLayer: (layer: Omit<UserLayer, "id" | "visible">) => void;
  onToggleLayerVisibility: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onZoomToLayer: (bbox: BBox | undefined) => void;
  annotations: Annotation[];
  onToggleAnnotationVisibility: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onZoomToAnnotation: (id: string) => void;
  onViewAnnotationAnalysis: (id: string) => void;
  isBasemapVisible: boolean;
  onToggleBasemapVisibility: () => void;
  panoImages: PanoImage[];
  onAddPanoImage: () => void;
  onSelectPanoImage: (id: string) => void;
  selectedPanoId: string | null;
}

export default function LayersPanel({
  viewMode,
  userLayers,
  onAddLayer,
  onToggleLayerVisibility,
  onDeleteLayer,
  onZoomToLayer,
  annotations,
  onToggleAnnotationVisibility,
  onDeleteAnnotation,
  onZoomToAnnotation,
  onViewAnnotationAnalysis,
  isBasemapVisible,
  onToggleBasemapVisibility,
  panoImages,
  onAddPanoImage,
  onSelectPanoImage,
  selectedPanoId,
}: LayersPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Test log to confirm component is loaded
  console.log("🔥 LAYERS PANEL COMPONENT LOADED - Updated version!");

  // Log when userLayers changes
  React.useEffect(() => {
    console.log(`=== LAYERS PANEL UPDATE ===`);
    console.log(`Total user layers: ${userLayers.length}`);
    userLayers.forEach((layer, index) => {
      console.log(`Layer ${index + 1}: ${layer.name} (${layer.type})`);
      if (layer.type === "raster") {
        const rasterData = layer.data as RasterLayerData & { bands?: number };
        console.log(`  - Bands: ${rasterData.bands}`);
        console.log(`  - Has DEM: ${!!rasterData.dem}`);
      }
    });
    console.log(`==========================`);
  }, [userLayers]);

  const userVectorLayers = userLayers.filter(
    (layer) => layer.type === "vector"
  );
  
  // Classify raster layers based on band count
  const userImageryLayers = userLayers.filter((layer) => {
    if (layer.type !== "raster") return false;
    const rasterData = layer.data as RasterLayerData & { bands?: number };
    const bands = rasterData.bands;
    
    // Detailed debug logging for raster data
    console.log(`=== RASTER LAYER DEBUG ===`);
    console.log(`Layer: ${layer.name}`);
    console.log(`Bands: ${bands} (type: ${typeof bands})`);
    console.log(`Has DEM data: ${!!rasterData.dem}`);
    console.log(`RasterData properties:`, Object.keys(rasterData));
    console.log(`Full rasterData:`, rasterData);
    console.log(`========================`);
    
    // Imagery: more than 1 band OR (not DEM and no band info)
    const isImagery = (bands !== undefined && bands > 1) || 
                     (!rasterData.dem && bands === undefined);
    console.log(`${layer.name} classified as imagery: ${isImagery}`);
    
    return isImagery;
  });
  
  const userElevationLayers = userLayers.filter((layer) => {
    if (layer.type !== "raster") return false;
    const rasterData = layer.data as RasterLayerData & { bands?: number };
    const bands = rasterData.bands;
    
    // DEM: exactly 1 band (regardless of DEM property) OR has DEM data with undefined bands
    const isElevation = (bands === 1) || 
                       (bands === undefined && !!rasterData.dem);
    console.log(`${layer.name} classified as elevation: ${isElevation}`);
    
    return isElevation;
  });

  const annotationPoints = annotations.filter(
    (a) => a.feature.geometry.type === "Point"
  );
  const annotationLines = annotations.filter(
    (a) => a.feature.geometry.type === "LineString"
  );
  const annotationPolygons = annotations.filter(
    (a) => a.feature.geometry.type === "Polygon"
  );

  const annotationGroups = [
    {
      type: "Point",
      label: "Points",
      icon: MapPin,
      annotations: annotationPoints,
    },
    {
      type: "LineString",
      label: "Lines",
      icon: Ruler,
      annotations: annotationLines,
    },
    {
      type: "Polygon",
      label: "Polygons",
      icon: Scaling,
      annotations: annotationPolygons,
    },
  ];

  const groupedPanoImages = useMemo(() => {
    const groups: Record<string, PanoImage[]> = {};
    panoImages.forEach(image => {
      const dateKey = image.captureDate 
        ? format(parseISO(image.captureDate), "PPP") 
        : "Unknown Date";
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(image);
    });
    // Fix: Compare the date strings, not the arrays
    return Object.entries(groups).sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  }, [panoImages]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      console.log("🚀 HANDLE FILE CHANGE CALLED!");
      
      const file = event.target.files?.[0];
      if (!file) return;

      console.log(`📁 File selected: ${file.name}`);

      try {
        const extension = file.name.split(".").pop()?.toLowerCase();
        console.log(`📋 File extension: ${extension}`);

        switch (extension) {
          case "geojson":
          case "kml":
          case "kmz":
          case "zip": {
            console.log(`Processing vector file: ${extension}`);
            // Handle vector data
            let vectorLayers: Omit<UserLayer, "id" | "visible">[] = [];
            if (extension === "geojson") {
              vectorLayers = await parseGeoJSON(file);
            } else if (extension === "zip") {
              vectorLayers = await parseShapefile(file);
            } else {
              vectorLayers = await parseKMLOrKMZ(file);
            }
            if (vectorLayers.length > 0) {
              vectorLayers.forEach(onAddLayer);
              toast({
                title: "Success",
                description: `${vectorLayers.length} vector layer(s) added from "${file.name}".`,
              });
            } else {
              throw new Error("No displayable vector layers found in the file.");
            }
            break;
          }
          case "tif":
          case "tiff": {
            console.log(`=== ABOUT TO CALL PARSEGEOTIFF ===`);
            console.log(`File name: ${file.name}`);
            console.log(`File size: ${file.size} bytes`);
            console.log(`File type: ${file.type}`);
            console.log(`================================`);
            
            const rasterLayers = await parseGeoTIFF(file);
            
            console.log(`=== PARSEGEOTIFF RETURNED ===`);
            console.log(`Number of layers returned: ${rasterLayers.length}`);
            console.log(`Raster layers array:`, rasterLayers);
            
            if (rasterLayers.length > 0) {
              rasterLayers.forEach((layer, index) => {
                console.log(`=== LAYER ${index + 1} DETAILS ===`);
                console.log(`Layer name: ${layer.name}`);
                console.log(`Layer type: ${layer.type}`);
                console.log(`Layer data:`, layer.data);
                if (layer.type === 'raster') {
                  const rasterData = layer.data as any;
                  console.log(`Raster data keys:`, Object.keys(rasterData));
                  console.log(`Bands property:`, rasterData.bands);
                  console.log(`Bands type:`, typeof rasterData.bands);
                  console.log(`Has DEM:`, !!rasterData.dem);
                  console.log(`DEM object:`, rasterData.dem);
                }
                console.log(`========================`);
                
                console.log(`=== CALLING onAddLayer for layer ${index + 1} ===`);
                onAddLayer(layer);
                console.log(`=== onAddLayer completed for layer ${index + 1} ===`);
              });
              
              toast({
                title: "Success",
                description: `${rasterLayers.length} raster layer(s) added from "${file.name}".`,
              });
            } else {
              throw new Error("No displayable raster layers found in the file.");
            }
            break;
          }
          default:
            throw new Error(`Unsupported file type: .${extension}`);
        }
      } catch (error) {
        console.error("Failed to parse file:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to load layer.",
        });
      } finally {
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [onAddLayer, toast]
  );

  const getUserLayerIcon = (layer: UserLayer) => {
    if (layer.type === "raster") {
      const rasterData = layer.data as RasterLayerData & { bands?: number };
      // Check if it's a DEM (elevation data)
      const bands = rasterData.bands;
      if (bands === 1 || (bands === undefined && !!rasterData.dem)) {
        return <Mountain className="h-4 w-4 text-muted-foreground" />;
      }
      // Otherwise it's imagery (more than 1 band)
      return <FileImage className="h-4 w-4 text-muted-foreground" />;
    }
    // Type guard and check for vector layer data
    if (layer.type === "vector") {
      const vectorData = layer.data as VectorLayerData;
      if (vectorData.type === "FeatureCollection") {
        const firstFeatureGeom = vectorData.features[0]?.geometry?.type;
        switch (firstFeatureGeom) {
          case "Polygon":
          case "MultiPolygon":
            return <Globe className="h-4 w-4 text-muted-foreground" />;
          case "LineString":
          case "MultiLineString":
            return <Wind className="h-4 w-4 text-muted-foreground" />;
          case "Point":
          case "MultiPoint":
            return <FileJson className="h-4 w-4 text-muted-foreground" />;
          default:
            return <Layers className="h-4 w-4 text-muted-foreground" />;
        }
      }
    }
    return <Layers className="h-4 w-4 text-muted-foreground" />;
  };

  const renderUserLayerItem = (layer: UserLayer) => (
    <div key={layer.id} className="flex items-center justify-between space-x-2">
      <div className="flex flex-1 items-center space-x-2 overflow-hidden">
        <Checkbox
          id={layer.id}
          checked={layer.visible}
          onCheckedChange={() => onToggleLayerVisibility(layer.id)}
        />
        <div className="flex items-center gap-2 overflow-hidden">
          {getUserLayerIcon(layer)}
          <Label
            htmlFor={layer.id}
            className="truncate font-normal"
            title={layer.name}
          >
            {layer.name}
          </Label>
        </div>
      </div>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomToLayer(layer.bbox)}
          disabled={!layer.bbox}
          aria-label="Zoom to layer"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDeleteLayer(layer.id)}
          aria-label="Delete layer"
        >
          <Trash2 className="h-4 w-4 text-destructive hover:text-destructive" />
        </Button>
      </div>
    </div>
  );

  const renderAnnotationItem = (annotation: Annotation) => (
    <div
      key={annotation.id}
      className="flex items-center justify-between space-x-2 py-1.5"
    >
      <div className="flex flex-1 items-center space-x-2 overflow-hidden">
        <Checkbox
          id={`anno-vis-${annotation.id}`}
          checked={annotation.visible}
          onCheckedChange={() => onToggleAnnotationVisibility(annotation.id)}
          aria-label="Toggle annotation visibility"
        />
        <div className="flex-1 flex-col overflow-hidden">
          <Label
            htmlFor={`anno-vis-${annotation.id}`}
            className="truncate font-normal"
            title={annotation.label}
          >
            {annotation.label}
          </Label>
          <span className="truncate text-xs text-muted-foreground">
            {annotation.measurement}
          </span>
        </div>
      </div>
      <div className="flex items-center">
        {annotation.analysisResult && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onViewAnnotationAnalysis(annotation.id)}
            aria-label="View analysis data"
            title="View analysis data"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomToAnnotation(annotation.id)}
          disabled={!annotation.bbox}
          aria-label="Zoom to annotation"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDeleteAnnotation(annotation.id)}
          aria-label="Delete annotation"
        >
          <Trash2 className="h-4 w-4 text-destructive hover:text-destructive" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".geojson,.kml,.kmz,.zip,.tif,.tiff"
      />
      
      {viewMode !== '360' && (
        <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Data
        </Button>
      )}

      {viewMode === "2d" && (
        <>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Base Map
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="basemap-toggle"
                  checked={isBasemapVisible}
                  onCheckedChange={onToggleBasemapVisibility}
                />
                <Label htmlFor="basemap-toggle" className="font-normal">
                  OpenStreetMap
                </Label>
              </div>
            </CardContent>
          </Card>

          {userVectorLayers.length > 0 && (
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Vector Layers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {userVectorLayers.map(renderUserLayerItem)}
              </CardContent>
            </Card>
          )}

          {userImageryLayers.length > 0 && (
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  Imagery
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {userImageryLayers.map(renderUserLayerItem)}
              </CardContent>
            </Card>
          )}

          {userElevationLayers.length > 0 && (
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Mountain className="h-4 w-4 text-muted-foreground" />
                  Elevations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {userElevationLayers.map(renderUserLayerItem)}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <PenSquare className="h-4 w-4 text-muted-foreground" />
                Annotations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-4 pt-0">
              {annotations.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No annotations saved yet.
                </p>
              ) : (
                <Accordion type="multiple" defaultValue={annotationGroups.map(g => g.label)} className="w-full space-y-1">
                  {annotationGroups.map((group) => {
                    if (group.annotations.length === 0) return null;

                    const allVisible = group.annotations.every(
                      (a) => a.visible
                    );
                    const someVisible =
                      group.annotations.some((a) => a.visible) && !allVisible;
                    const checkedState = allVisible
                      ? true
                      : someVisible
                      ? "indeterminate"
                      : false;

                    return (
                      <AccordionItem
                        value={group.label}
                        key={group.label}
                        className="rounded-md border bg-background"
                      >
                        <div className="flex items-center px-3">
                          <Checkbox
                            id={`toggle-group-${group.label}`}
                            checked={checkedState}
                            onCheckedChange={(isChecked) => {
                              const targetVisibility =
                                isChecked === false ? false : true;
                              group.annotations.forEach((a) => {
                                if (a.visible !== targetVisibility) {
                                  onToggleAnnotationVisibility(a.id);
                                }
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Toggle all ${group.label} annotations`}
                          />
                          <AccordionTrigger className="py-2 pl-3 text-sm font-medium hover:no-underline">
                            <div className="flex flex-1 items-center gap-2">
                              <group.icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-normal">
                                {group.label}
                              </span>
                            </div>
                          </AccordionTrigger>
                        </div>
                        <AccordionContent className="pb-2 px-3 pt-0">
                          <div className="divide-y divide-border border-t border-border">
                            {group.annotations.map(renderAnnotationItem)}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === "3d" && (
        <>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Box className="h-4 w-4 text-muted-foreground" />
                3D Models
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {modelLayers.map((layer) => (
                <div key={layer.id} className="flex items-center space-x-2">
                  <Checkbox id={layer.id} defaultChecked={layer.checked} />
                  <Label htmlFor={layer.id} className="font-normal">
                    {layer.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === "360" && (
        <>
          <Button className="w-full" onClick={onAddPanoImage}>
            <Plus className="mr-2 h-4 w-4" />
            Add 360&deg; Image
          </Button>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Camera className="h-4 w-4 text-muted-foreground" />
                Image Library
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {panoImages.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No 360&deg; images added yet.
                </p>
              ) : (
                 <Accordion type="multiple" defaultValue={groupedPanoImages.map(([date]) => date)} className="w-full space-y-2">
                  {groupedPanoImages.map(([date, images]) => (
                    <AccordionItem value={date} key={date} className="rounded-md border bg-background">
                      <AccordionTrigger className="py-2 px-3 text-sm font-medium hover:no-underline">
                        {date}
                      </AccordionTrigger>
                      <AccordionContent className="pb-2 px-3 pt-0">
                        <div className="divide-y divide-border border-t border-border">
                          {images.map(image => (
                            <button
                              key={image.id}
                              onClick={() => onSelectPanoImage(image.id)}
                              className={`w-full text-left p-2 text-sm truncate hover:bg-accent rounded-md ${selectedPanoId === image.id ? 'bg-accent' : ''}`}
                              title={image.name}
                            >
                              {image.name}
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                 </Accordion>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}