
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";
import { VolumeCalcMethod } from "@/types";

interface AnalysisResultDialogProps {
  result: {
    type: string;
    data: any;
    title: string;
  } | null;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md border bg-background p-2 shadow-sm">
        <p className="font-medium">{`Distance: ${label.toFixed(2)} m`}</p>
        <p className="text-primary">{`Elevation: ${payload[0].value.toFixed(2)} m`}</p>
      </div>
    );
  }
  return null;
};

const methodLabels: Record<VolumeCalcMethod, string> = {
  lowestPoint: "Lowest Point on Perimeter",
  averagePerimeter: "Average Elevation of Perimeter",
  bestFit: "Best-Fit Plane",
  fixedElevation: "Fixed Elevation"
};

export default function AnalysisResultDialog({
  result,
  onOpenChange,
  onSave,
}: AnalysisResultDialogProps) {
  const isOpen = !!result;

  const renderContent = () => {
    if (!result) return null;

    switch (result.type) {
      case "profile":
        return (
          <div className="h-80 w-full pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result.data}
                margin={{
                  top: 5,
                  right: 20,
                  left: 10,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="distance" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(val) => `${val.toFixed(0)}m`}
                  label={{ value: "Distance", position: 'insideBottom', offset: -5 }}
                />
                <YAxis
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(val) => `${val.toFixed(0)}m`}
                  label={{ value: 'Elevation', angle: -90, position: 'insideLeft', offset: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="elevation"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="Elevation"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      case "volume": {
        const { cut, fill, net, basePlane, method } = result.data;
        
        let baseElevationText = "";
        if ('elevation' in basePlane) {
          baseElevationText = `${basePlane.elevation.toFixed(2)} m`;
        } else {
          baseElevationText = `Tilted Plane (a=${basePlane.a.toExponential(2)}, b=${basePlane.b.toExponential(2)})`;
        }
        
        return (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fill Volume (above base):</span>
              <span className="font-mono font-semibold text-green-600">{fill.toFixed(2)} m³</span>
            </div>
             <div className="flex justify-between">
              <span className="text-muted-foreground">Cut Volume (below base):</span>
              <span className="font-mono font-semibold text-red-600">{cut.toFixed(2)} m³</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground font-bold">Net Volume (Fill - Cut):</span>
              <span className="font-mono font-semibold">{net.toFixed(2)} m³</span>
            </div>
            <div className="flex justify-between pt-4">
              <span className="text-muted-foreground">Calculation Method:</span>
              <span className="font-semibold">{methodLabels[method as VolumeCalcMethod]}</span>
            </div>
             <div className="flex justify-between">
              <span className="text-muted-foreground">Base Plane:</span>
              <span className="font-mono font-semibold">{baseElevationText}</span>
            </div>
             <p className="pt-4 text-xs text-muted-foreground">
                Note: Volume is calculated by summing the volume of DEM pixels above (fill) or below (cut) a defined base plane within the polygon.
            </p>
          </div>
        );
      }
      default:
        return <p>Unknown analysis result type.</p>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{result?.title || "Analysis Result"}</DialogTitle>
          <DialogDescription>
            Results of the geospatial analysis.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">{renderContent()}</div>
        <DialogFooter>
          {onSave && (
            <Button onClick={onSave}>Save as Annotation</Button>
          )}
          <Button variant={onSave ? "outline" : "default"} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
