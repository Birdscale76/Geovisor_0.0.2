"use client";

import { Globe } from "lucide-react";
import { ThemeToggle } from "@/app/components/theme-toggle";

export default function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary p-1 text-primary-foreground">
          <Globe className="h-6 w-6" />
        </div>
        <h1 className="font-headline text-xl font-semibold text-foreground">
          GeoVisor
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
