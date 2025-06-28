"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import ExifReader from "exifreader";
import { format } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPin, Calendar, FileImage } from "lucide-react";
import { readFileAsDataURL } from "@/lib/utils";
import type { Annotation } from "@/types";
import type { Point } from "geojson";

type LocationMode = "metadata" | "new" | "existing";

export interface PanoData {
  file: File;
  locationMode: LocationMode;
  existingAnnotationId?: string;
}

interface AddPanoImageDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: PanoData) => void;
  onStartPickingLocation: (file: File) => void;
  existingAnnotations: Annotation[];
}

export default function AddPanoImageDialog({
  isOpen,
  onOpenChange,
  onSave,
  onStartPickingLocation,
  existingAnnotations,
}: AddPanoImageDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ date: string | null; location: Point | null } | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("metadata");
  const [selectedAnnotation, setSelectedAnnotation] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pointAnnotations = existingAnnotations.filter(
    (a) => a.feature.geometry.type === "Point"
  );

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setFile(null);
      setPreview(null);
      setMetadata(null);
      setLocationMode("metadata");
      setSelectedAnnotation("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [isOpen]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview(await readFileAsDataURL(selectedFile));

    try {
      const tags = await ExifReader.load(selectedFile);
      const originalDate = tags.DateTimeOriginal?.description;
      const date = originalDate
        ? format(new Date(originalDate.replace(':', '-').replace(':', '-')), "PPP p")
        : null;
      
      let location: Point | null = null;
      if (tags.GPSLatitude && tags.GPSLongitude) {
        const lat = tags.GPSLatitude.description * (tags.GPSLatitudeRef?.description === 'S' ? -1 : 1);
        const lon = tags.GPSLongitude.description * (tags.GPSLongitudeRef?.description === 'W' ? -1 : 1);
        location = { type: "Point", coordinates: [lon, lat] };
      }
      setMetadata({ date, location });
      setLocationMode(location ? 'metadata' : 'new');
    } catch (error) {
      console.error("Could not read EXIF data:", error);
      setMetadata(null);
      setLocationMode('new');
    }
  }, []);

  const handleSave = () => {
    if (!file) return;

    if (locationMode === "new") {
      onStartPickingLocation(file);
    } else {
      onSave({ file, locationMode, existingAnnotationId: selectedAnnotation });
    }
    onOpenChange(false);
  };

  const isSaveDisabled = !file || (locationMode === 'existing' && !selectedAnnotation);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add 360° Image</DialogTitle>
          <DialogDescription>
            Upload a panoramic image to add it to the map.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pano-image">Image File</Label>
            <Input
              id="pano-image"
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileChange}
              ref={fileInputRef}
            />
          </div>

          {preview && (
            <div className="relative h-40 w-full overflow-hidden rounded-md border">
              <Image src={preview} alt="Preview" layout="fill" objectFit="cover" />
            </div>
          )}

          {file && metadata && (
             <Alert>
              <FileImage className="h-4 w-4" />
              <AlertTitle>Image Metadata</AlertTitle>
              <AlertDescription className="space-y-1">
                {metadata.date && <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {metadata.date}</p>}
                {metadata.location ? 
                  <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Location found</p> :
                  <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> No location data</p>
                }
              </AlertDescription>
            </Alert>
          )}

          {file && (
            <div className="space-y-2">
              <Label>Marker Location</Label>
              <Select onValueChange={(v) => setLocationMode(v as LocationMode)} value={locationMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metadata" disabled={!metadata?.location}>
                    From image metadata
                  </SelectItem>
                  <SelectItem value="new">Place new marker on map</SelectItem>
                  <SelectItem value="existing" disabled={pointAnnotations.length === 0}>
                    Use existing marker
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {file && locationMode === "existing" && (
            <div className="space-y-2">
              <Label>Select Existing Marker</Label>
               <Select onValueChange={setSelectedAnnotation} value={selectedAnnotation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a marker..." />
                </SelectTrigger>
                <SelectContent>
                  {pointAnnotations.map(anno => (
                    <SelectItem key={anno.id} value={anno.id}>{anno.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaveDisabled}>
            {locationMode === 'new' ? 'Pick Location on Map' : 'Save Image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
