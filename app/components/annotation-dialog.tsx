"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const annotationSchema = z.object({
  label: z.string().min(1, { message: "Label is required." }),
  description: z.string().optional(),
  tags: z.string().optional(),
});

export type AnnotationFormData = z.infer<typeof annotationSchema>;

interface AnnotationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  measurement: string;
  onSave: (data: AnnotationFormData) => void;
  onCancel: () => void;
}

export function AnnotationDialog({
  isOpen,
  onOpenChange,
  measurement,
  onSave,
  onCancel,
}: AnnotationDialogProps) {
  const form = useForm<AnnotationFormData>({
    resolver: zodResolver(annotationSchema),
    defaultValues: {
      label: "",
      description: "",
      tags: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onCancel();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)}>
            <DialogHeader>
              <DialogTitle>Save Annotation</DialogTitle>
              <DialogDescription>
                Add details to your new annotation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="rounded-md border bg-muted p-3 text-sm">
                <p className="font-medium">{measurement}</p>
              </div>
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Main Building" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a short description..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., building, important" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">Save Annotation</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
