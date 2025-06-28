
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { VolumeCalcMethod } from "@/types";

interface VolumeAnalysisDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCalculate: (method: VolumeCalcMethod, options: { fixedElevation?: number }) => void;
}

const methods: { value: VolumeCalcMethod; label: string; description: string }[] = [
  { 
    value: "lowestPoint", 
    label: "Lowest Point on Perimeter", 
    description: "Uses the lowest point on the boundary as a flat base." 
  },
  { 
    value: "averagePerimeter", 
    label: "Average Elevation of Perimeter", 
    description: "Uses the average elevation of the boundary as a flat base." 
  },
  { 
    value: "bestFit", 
    label: "Best-Fit Plane", 
    description: "Creates a tilted plane based on the boundary terrain." 
  },
  { 
    value: "fixedElevation", 
    label: "Fixed Elevation", 
    description: "Manually enter a specific elevation for the base." 
  },
];

export default function VolumeAnalysisDialog({
  isOpen,
  onOpenChange,
  onCalculate,
}: VolumeAnalysisDialogProps) {
  const [method, setMethod] = useState<VolumeCalcMethod>("lowestPoint");
  const [fixedElevation, setFixedElevation] = useState<string>("");

  const handleCalculate = () => {
    const options: { fixedElevation?: number } = {};
    if (method === 'fixedElevation') {
      const elevation = parseFloat(fixedElevation);
      if (isNaN(elevation)) {
        // Basic validation, can be improved with form library
        alert("Please enter a valid number for the elevation.");
        return;
      }
      options.fixedElevation = elevation;
    }
    onCalculate(method, options);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Stockpile Volume Analysis</DialogTitle>
          <DialogDescription>
            Select a method to calculate the volume.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as VolumeCalcMethod)}>
            {methods.map((m) => (
              <Label
                key={m.value}
                htmlFor={m.value}
                className="flex items-start space-x-3 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
              >
                <RadioGroupItem value={m.value} id={m.value} className="mt-0.5" />
                <div className="flex flex-col">
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-sm text-muted-foreground">{m.description}</span>
                </div>
              </Label>
            ))}
          </RadioGroup>

          {method === 'fixedElevation' && (
            <div className="space-y-2 pl-4">
                <Label htmlFor="fixed-elevation">Base Elevation (meters)</Label>
                <Input
                    id="fixed-elevation"
                    type="number"
                    value={fixedElevation}
                    onChange={(e) => setFixedElevation(e.target.value)}
                    placeholder="e.g., 150.5"
                />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleCalculate} disabled={method === 'fixedElevation' && !fixedElevation}>
            Calculate Volume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
