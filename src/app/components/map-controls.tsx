"use client";

import { Button } from "@/components/ui/button";
import { Ruler, Scaling, MapPin, GitCompare, LineChart, Box } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { Tool } from "@/types";

interface MapControlsProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  canCompare: boolean;
  hasDem: boolean;
}

export default function MapControls({
  activeTool,
  onToolChange,
  canCompare,
  hasDem,
}: MapControlsProps) {
  const measurementTools: {
    tool: "marker" | "distance" | "area";
    icon: React.ElementType;
    label: string;
    disabled?: boolean;
  }[] = [
    { tool: "marker", icon: MapPin, label: "Add Marker" },
    { tool: "distance", icon: Ruler, label: "Measure Distance" },
    { tool: "area", icon: Scaling, label: "Measure Area" },
  ];
  
  const analysisTools: {
    tool: "profile" | "volume";
    icon: React.ElementType;
    label: string;
    disabled?: boolean;
  }[] = [
    { tool: "profile", icon: LineChart, label: "Elevation Profile", disabled: !hasDem },
    { tool: "volume", icon: Box, label: "Calculate Volume", disabled: !hasDem },
  ];

  const handleToolClick = (tool: Tool) => {
    onToolChange(tool === activeTool ? null : tool);
  };

  return (
    <div className="absolute right-5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-lg border bg-card/80 p-1.5 backdrop-blur-sm">
      <Button
        key="comparison"
        variant={activeTool === "comparison" ? "secondary" : "ghost"}
        size="icon"
        onClick={() => handleToolClick("comparison")}
        aria-label="Compare Rasters"
        className="h-9 w-9"
        disabled={!canCompare}
        title="Compare Rasters"
      >
        <GitCompare className="h-5 w-5" />
      </Button>

      <Separator className="my-1 bg-border/50" />

      {measurementTools.map(({ tool, icon: Icon, label }) => (
        <Button
          key={tool}
          variant={activeTool === tool ? "secondary" : "ghost"}
          size="icon"
          onClick={() => handleToolClick(tool)}
          aria-label={label}
          title={label}
          className="h-9 w-9"
        >
          <Icon className="h-5 w-5" />
        </Button>
      ))}
      
      <Separator className="my-1 bg-border/50" />
      
      {analysisTools.map(({ tool, icon: Icon, label, disabled }) => (
        <Button
          key={tool}
          variant={activeTool === tool ? "secondary" : "ghost"}
          size="icon"
          onClick={() => handleToolClick(tool)}
          aria-label={label}
          title={label}
          className="h-9 w-9"
          disabled={disabled}
        >
          <Icon className="h-5 w-5" />
        </Button>
      ))}
    </div>
  );
}
