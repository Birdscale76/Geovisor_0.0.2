"use client";

import React, { useRef, useEffect } from "react";
import type { Viewer as ViewerType, ClickData } from "@photo-sphere-viewer/core";
import { Viewer } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import type { PanoImage, PanoHotspot } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";

const generateTooltipContent = (hotspot: PanoHotspot) => {
  const lines = [`<p class="font-bold">${hotspot.label}</p>`];
  if (hotspot.description) {
    lines.push(`<p>${hotspot.description}</p>`);
  }
  if (hotspot.type === 'issue') {
    if (hotspot.status) lines.push(`<p><b>Status:</b> ${hotspot.status}</p>`);
    if (hotspot.responsible) lines.push(`<p><b>Responsible:</b> ${hotspot.responsible}</p>`);
  }
  return lines.join('');
};

interface PannellumViewerProps {
  image: PanoImage | null;
  onStartAddingHotspot: () => void;
  isAddingHotspot: boolean;
  onAddHotspot: (data: { pitch: number; yaw: number }) => void;
}

export default function PannellumViewer({
  image,
  onStartAddingHotspot,
  isAddingHotspot,
  onAddHotspot,
}: PannellumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerType | null>(null);
  const markersPluginRef = useRef<MarkersPlugin | null>(null);

  // Use refs for callbacks and state to avoid stale closures in event listeners
  const isAddingHotspotRef = useRef(isAddingHotspot);
  const onAddHotspotRef = useRef(onAddHotspot);
  useEffect(() => {
    isAddingHotspotRef.current = isAddingHotspot;
    onAddHotspotRef.current = onAddHotspot;
  }, [isAddingHotspot, onAddHotspot]);

  // Effect to initialize and destroy the viewer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !image) {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      markersPluginRef.current = null;
      return;
    }

    const viewer = new Viewer({
      container,
      panorama: image.src,
      navbar: ["zoom", "fullscreen"],
      plugins: [[MarkersPlugin, {}]],
    });

    viewerRef.current = viewer;
    markersPluginRef.current = viewer.getPlugin(MarkersPlugin) as MarkersPlugin;

    viewer.addEventListener("click", ({ data }: { data: ClickData }) => {
      if (isAddingHotspotRef.current) {
        onAddHotspotRef.current({ 
          pitch: data.pitch, 
          yaw: data.yaw 
        });
      }
    });

    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      markersPluginRef.current = null;
    };
  }, [image?.src]); // Re-create the viewer only when the image source changes

  // Effect to update viewer options and markers when props change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.setOptions({
      mousemove: !isAddingHotspot,
      mousewheel: !isAddingHotspot,
    });

    const markersPlugin = markersPluginRef.current;
    if (markersPlugin && image?.hotspots) {
      const viewerMarkers = image.hotspots.map((hotspot) => ({
        id: hotspot.id,
        longitude: hotspot.yaw,
        latitude: hotspot.pitch,
        html: `<div class="${
          hotspot.type === "issue"
            ? "photosphere-hotspot-issue"
            : "photosphere-hotspot-annotation"
        }"></div>`,
        tooltip: {
          content: generateTooltipContent(hotspot),
          className: "photosphere-tooltip",
          position: "top center" as const,
          trigger: "hover" as const,
        },
        anchor: "center center" as const,
      }));
      markersPlugin.setMarkers(viewerMarkers);
    }
  }, [image?.hotspots, isAddingHotspot]);

  if (!image) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <p className="text-muted-foreground">Select an image to view</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ cursor: isAddingHotspot ? "crosshair" : "grab" }}
      />
      <div className="absolute top-1/2 right-5 z-10 -translate-y-1/2 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={onStartAddingHotspot}
          aria-label="Add Hotspot"
          title="Add Hotspot"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}