"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Ruler, Scaling, MapPin, GitCompare, LineChart, Box } from "lucide-react";
import type { Tool } from "@/types";

interface ToolsPanelProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  canCompare: boolean;
  hasDem: boolean;
}

export default function ToolsPanel({
  activeTool,
  onToolChange,
  canCompare,
  hasDem,
}: ToolsPanelProps) {
  const handleToolToggle = (tool: NonNullable<Tool>) => {
    onToolChange(tool);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis & Annotation</CardTitle>
        <CardDescription>Select a tool to use on the map.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant={activeTool === "comparison" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("comparison")}
          disabled={!canCompare}
        >
          <GitCompare className="mr-2 h-4 w-4" /> Compare Rasters
        </Button>
        <Button
          variant={activeTool === "marker" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("marker")}
        >
          <MapPin className="mr-2 h-4 w-4" /> Add Marker
        </Button>
        <Button
          variant={activeTool === "distance" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("distance")}
        >
          <Ruler className="mr-2 h-4 w-4" /> Measure Distance
        </Button>
        <Button
          variant={activeTool === "area" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("area")}
        >
          <Scaling className="mr-2 h-4 w-4" /> Measure Area
        </Button>
        <Button
          variant={activeTool === "profile" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("profile")}
          disabled={!hasDem}
        >
          <LineChart className="mr-2 h-4 w-4" /> Elevation Profile
        </Button>
        <Button
          variant={activeTool === "volume" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => handleToolToggle("volume")}
          disabled={!hasDem}
        >
          <Box className="mr-2 h-4 w-4" /> Stockpile Volume
        </Button>
      </CardContent>
    </Card>
  );
}
