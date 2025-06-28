"use client";

import React, { useRef, useEffect, useCallback, useMemo } from "react";
import type { Viewer as ViewerType } from "@photo-sphere-viewer/core";
import { Viewer } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { AutorotatePlugin } from "@photo-sphere-viewer/autorotate-plugin";
import type { PanoImage, PanoHotspot } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";

// ============================================================================
// CONSTANTS & PERFORMANCE CONFIG
// ============================================================================

const CONFIG = {
  MOVEMENT_STEP: 0.1,
  ZOOM_STEP: 10,
  ZOOM_LIMITS: { min: 30, max: 90 },
  SPEEDS: { autorotate: '5rpm', reset: '30rpm' },
  DEBOUNCE_DELAY: 100,
  CURSOR_UPDATE_INTERVAL: 200
} as const;

const STATUS_COLORS = {
  Open: { gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', shadow: 'rgba(239, 68, 68, 0.4)' },
  'In Progress': { gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245, 158, 11, 0.4)' },
  Resolved: { gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: 'rgba(16, 185, 129, 0.4)' },
  annotation: { gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', shadow: 'rgba(59, 130, 246, 0.4)' }
} as const;

// Memoized icons to prevent recreation
const ICONS = Object.freeze({
  issue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="m12 17.02.01 0"/></svg>',
  annotation: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m12 16 .01 0"/><path d="M12 8v4"/></svg>'
} as const);

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

// Debounce utility for performance
const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Memoized coordinate normalization
const normalizeCoordinates = (yaw: number, pitch: number) => {
  if (typeof yaw !== 'number' || typeof pitch !== 'number' || isNaN(yaw) || isNaN(pitch)) {
    return { yaw: 0, pitch: 0 };
  }
  
  let normalizedYaw = ((yaw + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (normalizedYaw < -Math.PI) normalizedYaw += 2 * Math.PI;
  if (normalizedYaw > Math.PI) normalizedYaw -= 2 * Math.PI;
  
  const normalizedPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  return { yaw: normalizedYaw, pitch: normalizedPitch };
};

const isValidPosition = (yaw: number, pitch: number) => 
  !isNaN(yaw) && !isNaN(pitch) && 
  yaw >= -Math.PI && yaw <= Math.PI && 
  pitch >= -Math.PI / 2 && pitch <= Math.PI / 2;

// Memoized marker color calculation
const getMarkerColors = (hotspot: PanoHotspot) => 
  STATUS_COLORS[hotspot.type === 'issue' ? hotspot.status || 'Open' : 'annotation'];

// Optimized tooltip content generation
const generateTooltipContent = (hotspot: PanoHotspot) => {
  const parts = [`<p class="font-bold">${hotspot.label}</p>`];
  
  if (hotspot.description) parts.push(`<p>${hotspot.description}</p>`);
  
  if (hotspot.type === 'issue') {
    if (hotspot.status) {
      const emoji = hotspot.status === 'Open' ? '🔴' : hotspot.status === 'In Progress' ? '🟡' : '🟢';
      parts.push(`<p><b>Status:</b> ${emoji} ${hotspot.status}</p>`);
    }
    if (hotspot.responsible) parts.push(`<p><b>Responsible:</b> ${hotspot.responsible}</p>`);
  }
  
  return parts.join('');
};

// Optimized marker HTML creation with reduced DOM operations
const createMarkerHTML = (hotspot: PanoHotspot) => {
  const colors = getMarkerColors(hotspot);
  const icon = ICONS[hotspot.type];

  return `
    <div class="panorama-marker" data-type="${hotspot.type}">
      <div class="marker-icon" style="background: ${colors.gradient}; box-shadow: 0 4px 12px ${colors.shadow};">
        ${icon}
      </div>
    </div>`;
};

// Global styles to prevent repeated injection
let stylesInjected = false;
const injectGlobalStyles = () => {
  if (stylesInjected) return;
  
  const style = document.createElement('style');
  style.textContent = `
    .panorama-marker { 
      position: relative; 
      width: 32px; 
      height: 32px; 
      cursor: pointer; 
      transition: transform 0.3s ease; 
      will-change: transform;
    }
    .panorama-marker:hover { transform: scale(1.1); }
    .marker-icon { 
      width: 32px; 
      height: 32px; 
      border-radius: 50%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      border: 2px solid rgba(255, 255, 255, 0.9); 
      color: white; 
    }
    .adding-hotspot-mode, .adding-hotspot-mode *, .adding-hotspot-mode canvas { 
      cursor: crosshair !important; 
    }
    .photosphere-tooltip { 
      background: rgba(0, 0, 0, 0.9); 
      border: 1px solid rgba(255, 255, 255, 0.1); 
      border-radius: 8px; 
      padding: 12px 16px; 
      font-size: 14px; 
      color: white; 
      max-width: 250px; 
    }
    .photosphere-tooltip p { margin: 0 0 8px 0; }
    .photosphere-tooltip p:last-child { margin-bottom: 0; }
    .photosphere-tooltip .font-bold { font-weight: 600; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
};

// ============================================================================
// PERFORMANCE-OPTIMIZED HOOKS
// ============================================================================

const useStableRefs = <T extends Record<string, any>>(props: T) => {
  const refs = useRef(props);
  
  // Only update if props actually changed
  useEffect(() => {
    let hasChanged = false;
    for (const key in props) {
      if (refs.current[key] !== props[key]) {
        hasChanged = true;
        break;
      }
    }
    if (hasChanged) {
      refs.current = props;
    }
  }, Object.values(props));
  
  return refs;
};

const useKeyboardControls = (
  viewerRef: React.RefObject<ViewerType>, 
  handleZoom: (direction: 'in' | 'out') => void, 
  isAddingHotspot: boolean
) => {
  // Memoize keyboard actions to prevent recreation
  const keyboardActions = useMemo(() => {
    const { MOVEMENT_STEP: step } = CONFIG;
    
    return {
      movement: {
        'w': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw, pitch: Math.min(Math.PI / 2, pos.pitch + step) }),
        'arrowup': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw, pitch: Math.min(Math.PI / 2, pos.pitch + step) }),
        's': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw, pitch: Math.max(-Math.PI / 2, pos.pitch - step) }),
        'arrowdown': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw, pitch: Math.max(-Math.PI / 2, pos.pitch - step) }),
        'a': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw - step, pitch: pos.pitch }),
        'arrowleft': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw - step, pitch: pos.pitch }),
        'd': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw + step, pitch: pos.pitch }),
        'arrowright': (pos: any, viewer: ViewerType) => viewer.rotate({ yaw: pos.yaw + step, pitch: pos.pitch }),
      },
      zoom: {
        'q': () => handleZoom('in'),
        '+': () => handleZoom('in'),
        '=': () => handleZoom('in'),
        'e': () => handleZoom('out'),
        '-': () => handleZoom('out'),
        '_': () => handleZoom('out'),
      },
      reset: {
        'r': (viewer: ViewerType) => viewer.animate({ yaw: 0, pitch: 0, zoom: 50, speed: CONFIG.SPEEDS.reset }),
      }
    };
  }, [handleZoom]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Early return for performance
    if (isAddingHotspot || 
        event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const key = event.key.toLowerCase();
    
    // Check movement actions
    if (key in keyboardActions.movement) {
      event.preventDefault();
      const pos = viewer.getPosition();
      keyboardActions.movement[key as keyof typeof keyboardActions.movement](pos, viewer);
      return;
    }
    
    // Check zoom actions
    if (key in keyboardActions.zoom) {
      event.preventDefault();
      keyboardActions.zoom[key as keyof typeof keyboardActions.zoom]();
      return;
    }
    
    // Check reset action
    if (key in keyboardActions.reset) {
      event.preventDefault();
      keyboardActions.reset[key as keyof typeof keyboardActions.reset](viewer);
    }
  }, [viewerRef, keyboardActions, isAddingHotspot]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

const useCursorManagement = (containerRef: React.RefObject<HTMLDivElement>, isAddingHotspot: boolean) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const setCursor = useCallback((cursor: string) => {
    const container = containerRef.current;
    if (!container) return;
    
    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      const elements = [container, ...Array.from(container.querySelectorAll('*'))];
      elements.forEach(el => (el as HTMLElement).style.cursor = cursor);
    });
  }, [containerRef]);

  useEffect(() => {
    if (isAddingHotspot) {
      setCursor('crosshair');
      // Reduced interval frequency for better performance
      intervalRef.current = setInterval(() => setCursor('crosshair'), CONFIG.CURSOR_UPDATE_INTERVAL);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCursor('');
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAddingHotspot, setCursor]);

  return { setCursor };
};

const useMarkerManagement = (
  markersPluginRef: React.RefObject<MarkersPlugin>, 
  image: PanoImage | null
) => {
  // Memoize markers to prevent unnecessary recalculations
  const markers = useMemo(() => {
    if (!image?.hotspots) return [];
    
    return image.hotspots
      .map(hotspot => {
        const { yaw, pitch } = normalizeCoordinates(hotspot.yaw, hotspot.pitch);
        if (!isValidPosition(yaw, pitch)) return null;

        return {
          id: hotspot.id,
          position: { yaw, pitch },
          html: createMarkerHTML(hotspot),
          tooltip: {
            content: generateTooltipContent(hotspot),
            className: "photosphere-tooltip",
            position: "top center" as const,
            trigger: "hover" as const,
          },
          anchor: "center center" as const,
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [image?.hotspots]);

  // Debounced marker update for performance
  const updateMarkers = useMemo(
    () => debounce(() => {
      const plugin = markersPluginRef.current;
      if (!plugin) return;
      
      plugin.setMarkers(markers);
    }, CONFIG.DEBOUNCE_DELAY),
    [markersPluginRef, markers]
  );

  return { updateMarkers, markers };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PannellumViewerProps {
  image: PanoImage | null;
  onStartAddingHotspot: () => void;
  isAddingHotspot: boolean;
  onAddHotspot: (data: { pitch: number; yaw: number }) => void;
  onUpdateHotspot?: (hotspotId: string, updates: Partial<PanoHotspot>) => void;
}

export default function PannellumViewer({
  image,
  onStartAddingHotspot,
  isAddingHotspot,
  onAddHotspot,
  onUpdateHotspot,
}: PannellumViewerProps) {
  
  // ============================================================================
  // REFS & STATE MANAGEMENT
  // ============================================================================
  
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerType | null>(null);
  const markersPluginRef = useRef<MarkersPlugin | null>(null);
  const autorotatePluginRef = useRef<AutorotatePlugin | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  
  // Stable callback refs with performance optimization
  const callbackRefs = useStableRefs({ isAddingHotspot, onAddHotspot, onUpdateHotspot });
  
  // ============================================================================
  // CONTROLS WITH PERFORMANCE OPTIMIZATION
  // ============================================================================
  
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    
    const currentZoom = viewer.getZoomLevel();
    const newZoom = direction === 'in' 
      ? Math.max(CONFIG.ZOOM_LIMITS.min, currentZoom - CONFIG.ZOOM_STEP)
      : Math.min(CONFIG.ZOOM_LIMITS.max, currentZoom + CONFIG.ZOOM_STEP);
    
    viewer.zoom(newZoom);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.warn);
    } else {
      container.requestFullscreen().catch(console.warn);
    }
  }, []);

  const toggleAutoRotation = useCallback(() => {
    const plugin = autorotatePluginRef.current;
    if (!plugin) return;
    
    try {
      plugin.isEnabled() ? plugin.stop() : plugin.start();
    } catch (error) {
      console.warn('Auto-rotation toggle failed:', error);
    }
  }, []);

  // ============================================================================
  // EVENT HANDLERS WITH MEMORY MANAGEMENT
  // ============================================================================
  
  const handleClick = useCallback((event: any) => {
    if (callbackRefs.current.isAddingHotspot && event.data) {
      callbackRefs.current.onAddHotspot({ 
        pitch: event.data.pitch, 
        yaw: event.data.yaw 
      });
    }
  }, [callbackRefs]);

  const handleSpaceKey = useCallback((event: React.KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      toggleAutoRotation();
    }
  }, [toggleAutoRotation]);

  // ============================================================================
  // CUSTOM HOOKS WITH PERFORMANCE OPTIMIZATIONS
  // ============================================================================
  
  useKeyboardControls(viewerRef, handleZoom, isAddingHotspot);
  const { setCursor } = useCursorManagement(containerRef, isAddingHotspot);
  const { updateMarkers } = useMarkerManagement(markersPluginRef, image);

  // ============================================================================
  // VIEWER INITIALIZATION WITH PROPER CLEANUP
  // ============================================================================
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !image) return;

    // Inject global styles once
    injectGlobalStyles();

    let viewer: ViewerType | null = null;
    
    const initializeViewer = async () => {
      try {
        viewer = new Viewer({
          container,
          panorama: image.src,
          navbar: false,
          plugins: [
            [MarkersPlugin, {}],
            [AutorotatePlugin, { 
              autostartDelay: null,
              autostartOnIdle: false,
              autorotateSpeed: CONFIG.SPEEDS.autorotate 
            }]
          ],
          // Valid Photo Sphere Viewer configuration options
          loadingImg: undefined, // Skip loading image for faster startup
          loadingTxt: '', // Remove loading text for cleaner experience
          size: undefined, // Let container determine size
          fisheye: false, // Disable fisheye for better performance
          minFov: CONFIG.ZOOM_LIMITS.min,
          maxFov: CONFIG.ZOOM_LIMITS.max,
          defaultZoomLvl: 50,
          moveSpeed: 1.0,
          zoomSpeed: 1.0
        });

        // Store references
        viewerRef.current = viewer;
        markersPluginRef.current = viewer.getPlugin(MarkersPlugin) as MarkersPlugin;
        autorotatePluginRef.current = viewer.getPlugin(AutorotatePlugin) as AutorotatePlugin;

        // Aggressive auto-rotation prevention
        const stopAutoRotation = () => {
          try {
            autorotatePluginRef.current?.stop();
          } catch (error) {
            console.warn('Failed to stop auto-rotation:', error);
          }
        };

        // Multiple stop attempts with error handling
        const timeouts = [0, 50, 100, 200, 500].map(delay => 
          setTimeout(stopAutoRotation, delay)
        );
        
        viewer.addEventListener('ready', () => {
          setTimeout(stopAutoRotation, 50);
        });

        // Event listeners with error handling
        viewer.addEventListener("click", handleClick);

        // Store cleanup functions
        cleanupRef.current = [
          () => viewer?.removeEventListener("click", handleClick),
          () => timeouts.forEach(clearTimeout),
          () => stopAutoRotation(),
          () => {
            try {
              viewer?.destroy();
            } catch (error) {
              console.warn('Viewer cleanup error:', error);
            }
          }
        ];

      } catch (error) {
        console.error('Viewer initialization failed:', error);
      }
    };

    initializeViewer();

    return () => {
      // Execute all cleanup functions
      cleanupRef.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.warn('Cleanup error:', error);
        }
      });
      cleanupRef.current = [];
      
      // Clear refs
      viewerRef.current = null;
      markersPluginRef.current = null;
      autorotatePluginRef.current = null;
    };
  }, [image?.src, handleClick]);

  // ============================================================================
  // MARKER UPDATES WITH PERFORMANCE OPTIMIZATION
  // ============================================================================
  
  useEffect(() => {
    if (!isAddingHotspot && markersPluginRef.current) {
      updateMarkers();
    }
  }, [image?.hotspots, isAddingHotspot, updateMarkers]);

  // ============================================================================
  // RENDER WITH MEMOIZED ELEMENTS
  // ============================================================================
  
  // Memoize control buttons to prevent re-renders
  const controlButtons = useMemo(() => [
    { Icon: document.fullscreenElement ? Minimize : Maximize, onClick: toggleFullscreen, label: "Toggle Fullscreen" },
    { Icon: ZoomIn, onClick: () => handleZoom('in'), label: "Zoom In" },
    { Icon: ZoomOut, onClick: () => handleZoom('out'), label: "Zoom Out" }
  ], [toggleFullscreen, handleZoom]);

  // Memoize keyboard shortcuts
  const keyboardShortcuts = useMemo(() => [
    ['WASD', 'Move'], ['Arrows', 'Move'], ['Q/E', 'Zoom'], 
    ['+/-', 'Zoom'], ['R', 'Reset'], ['Space', 'Auto-rotate']
  ], []);

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
        className={`h-full w-full focus:outline-none ${isAddingHotspot ? 'adding-hotspot-mode' : ''}`}
        tabIndex={0}
        onClick={() => containerRef.current?.focus()}
        onKeyDown={handleSpaceKey}
      />
      
      {/* Memoized Controls */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-black/50 backdrop-blur-md rounded-lg p-2 border border-white/10">
        {controlButtons.map(({ Icon, onClick, label }, index) => (
          <Button
            key={`${label}-${index}`}
            variant="secondary"
            size="icon"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="bg-transparent hover:bg-white/20 border-0"
          >
            <Icon className="h-4 w-4 text-white" />
          </Button>
        ))}
      </div>
      
      <div className="absolute top-1/2 right-5 z-10 -translate-y-1/2">
        <Button 
          variant="secondary" 
          size="icon" 
          onClick={onStartAddingHotspot} 
          aria-label="Add Hotspot"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Memoized Help */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-white text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {keyboardShortcuts.map(([key, action]) => (
            <div key={`${key}-${action}`}>
              <kbd className="bg-white/20 px-1 rounded">{key}</kbd> {action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}