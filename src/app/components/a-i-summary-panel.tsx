"use client";

import { useState } from "react";
import {
  summarizeSelectedFeatures,
  type SummarizeSelectedFeaturesInput,
} from "@/ai/flows/summarize-selected-features";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const mockFeatures = [
  {
    type: "Feature",
    properties: { name: "Building A", usage: "commercial", height: "50m" },
    geometry: "...",
  },
  {
    type: "Feature",
    properties: { name: "Building B", usage: "residential", height: "30m" },
    geometry: "...",
  },
  {
    type: "Feature",
    properties: { name: "Park", usage: "recreational", area: "5000sqm" },
    geometry: "...",
  },
];

export default function AISummaryPanel() {
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featuresSelected, setFeaturesSelected] = useState(false);

  const handleSummarize = async () => {
    setIsLoading(true);
    setError(null);
    setSummary("");
    try {
      const input: SummarizeSelectedFeaturesInput = {
        features: JSON.stringify(mockFeatures),
      };
      const result = await summarizeSelectedFeatures(input);
      setSummary(result.summary);
    } catch (e) {
      setError("An error occurred while generating the summary.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Feature Summarization</CardTitle>
        <CardDescription>
          Select features on the map and get an AI-powered summary of their
          attributes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="select-features"
            checked={featuresSelected}
            onCheckedChange={(checked) => setFeaturesSelected(!!checked)}
          />
          <Label htmlFor="select-features">Simulate feature selection</Label>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : summary ? (
          <Textarea value={summary} readOnly rows={8} className="bg-muted" />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              Summary will appear here
            </p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSummarize}
          disabled={isLoading || !featuresSelected}
          className="w-full"
        >
          {isLoading ? "Generating..." : "Generate Summary"}
        </Button>
      </CardFooter>
    </Card>
  );
}
