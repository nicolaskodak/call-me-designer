import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import paper from 'paper';
import { jsPDF } from 'jspdf';
import { AppState } from '../types';
import { generateOutlineCoordinates, loadImage } from '../utils/imageProcessing';

interface EditorCanvasProps {
  appState: AppState;
  onPathChange?: (segmentsCount: number) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export interface EditorCanvasHandle {
  exportSVG: () => void;
  exportSVGAligned: () => void;
  exportSVGTrimmed: () => void;
  exportPDF: () => void;
  undo: () => void;
  redo: () => void;
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(({ appState, onPathChange, onHistoryChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<paper.PaperScope | null>(null);
  
  // Data source for the vector paths
  const [processedPathData, setProcessedPathData] = useState<number[][][] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // History State
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Internal helper to save current state to history
  const saveHistory = (scope: paper.PaperScope) => {
      const pathsGroup = scope.project.getItem({ name: 'outlines' });
      // We only save if the group exists. It's okay if it's empty (user deleted all nodes).
      if (!pathsGroup) return;

      const json = pathsGroup.exportJSON({ asString: false });
      
      // If we are in the middle of the stack, truncate future
      if (historyIndexRef.current < historyRef.current.length - 1) {
          historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      }

      historyRef.current.push(JSON.stringify(json));
      historyIndexRef.current++;
      
      notifyHistoryChange();
  };

  const notifyHistoryChange = () => {
      if (onHistoryChange) {
          onHistoryChange(
              historyIndexRef.current > 0, 
              historyIndexRef.current < historyRef.current.length - 1
          );
      }
  };

  const applyStyles = (item: paper.Item) => {
    // Apply styles to Paths
    if (item instanceof paper.Path) {
        const sColor = new paper.Color(appState.strokeColor);
        sColor.alpha = appState.strokeOpacity;
        item.strokeColor = sColor;

        const fColor = new paper.Color(appState.fillColor);
        fColor.alpha = appState.fillOpacity;
        item.fillColor = fColor;

        item.strokeWidth = appState.strokeWidth;
        item.fullySelected = appState.showPoints;
    }
    // Recursively apply to children (Groups, CompoundPaths)
    if (item.children) {
        item.children.forEach(child => applyStyles(child));
    }
  };

  const restoreHistory = (jsonString: string) => {
      if (!scopeRef.current) return;
      const scope = scopeRef.current;
      
      const oldGroup = scope.project.getItem({ name: 'outlines' });
      if (oldGroup) oldGroup.remove();

      // Import creates a new item
      const newItem = scope.project.importJSON(jsonString) as paper.Item;
      if (newItem) {
          newItem.name = 'outlines';
          
          // Ensure z-index correctness: Place above raster
          const raster = scope.project.getItem({ name: 'mainImage' });
          if (raster) {
            newItem.insertAbove(raster);
          }

          // Re-apply current AppState styles
          applyStyles(newItem);
          
          // Force a view update
          scope.view.update();
          
          updateSegmentCount(scope);
      }
  };

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    exportSVGAligned: () => {
      if (!scopeRef.current || !appState.imageWidth || !appState.imageHeight) return;
      const scope = scopeRef.current;

      const raster = scope.project.getItem({ name: 'mainImage' });
      const originalVisibility = raster ? raster.visible : true;
      if (raster) raster.visible = false;

      const svgString = scope.project.exportSVG({
        asString: true,
        bounds: new paper.Rectangle(0, 0, appState.imageWidth, appState.imageHeight),
      }) as string;

      if (raster) raster.visible = originalVisibility;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contour-crafted-outline-aligned.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    exportSVGTrimmed: () => {
      if (!scopeRef.current || !appState.imageWidth || !appState.imageHeight) return;
      const scope = scopeRef.current;

      const pathsGroup = scope.project.getItem({ name: 'outlines' });
      if (!pathsGroup) return;

      const raster = scope.project.getItem({ name: 'mainImage' });
      const originalVisibility = raster ? raster.visible : true;
      if (raster) raster.visible = false;

      // Export tightly around the outline paths (not the full image bounds).
      // Use strokeBounds so the exported viewBox doesn't clip the visible stroke.
      const b = (pathsGroup as any).strokeBounds ?? pathsGroup.bounds;
      const padding = Math.max(0, Math.ceil(appState.strokeWidth / 2));
      const exportBounds = new paper.Rectangle(
        b.x - padding,
        b.y - padding,
        b.width + padding * 2,
        b.height + padding * 2
      );

      const svgString = scope.project.exportSVG({
        asString: true,
        bounds: exportBounds,
      }) as string;

      if (raster) raster.visible = originalVisibility;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contour-crafted-outline-trimmed.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    exportSVG: () => {
      // Back-compat: default export is the aligned version for easy overlay with the original image.
      if (!scopeRef.current || !appState.imageWidth || !appState.imageHeight) return;
      const scope = scopeRef.current;

      const raster = scope.project.getItem({ name: 'mainImage' });
      const originalVisibility = raster ? raster.visible : true;
      if (raster) raster.visible = false;

      const svgString = scope.project.exportSVG({
        asString: true,
        bounds: new paper.Rectangle(0, 0, appState.imageWidth, appState.imageHeight),
      }) as string;

      if (raster) raster.visible = originalVisibility;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contour-crafted-outline.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    exportPDF: () => {
      if (!scopeRef.current || !appState.imageWidth || !appState.imageHeight) return;
      const scope = scopeRef.current;

      // Create PDF matching image size in pixels 1:1
      const doc = new jsPDF({
          orientation: appState.imageWidth > appState.imageHeight ? 'l' : 'p',
          unit: 'px',
          format: [appState.imageWidth, appState.imageHeight],
          hotfixes: ['px_scaling'] 
      });

      // 1. Render Background Image
      const raster = scope.project.getItem({ name: 'mainImage' }) as paper.Raster;
      if (raster && raster.image instanceof HTMLImageElement) {
        // We use 'PNG' or 'JPEG' depending on source, but 'PNG' handles transparency best in PDF
        try {
          doc.addImage(raster.image, 'PNG', 0, 0, appState.imageWidth, appState.imageHeight);
        } catch (e) {
          console.error("Error adding image to PDF", e);
        }
      }

      // 2. Render Paths
      const pathsGroup = scope.project.getItem({ name: 'outlines' });
      if (pathsGroup && pathsGroup.children) {
          // Use a standard cut color (Red) and thin line
          doc.setDrawColor(255, 0, 0);
          doc.setLineWidth(1);

          pathsGroup.children.forEach(item => {
              if (item instanceof paper.Path) {
                   const curves = item.curves;
                   if (curves.length > 0) {
                       const start = curves[0].point1;
                       doc.moveTo(start.x, start.y);
                       
                       curves.forEach(curve => {
                           const p1 = curve.point1;
                           const p2 = curve.point2;
                           const h1 = curve.handle1;
                           const h2 = curve.handle2;
                           
                           // Calculate control points (Handles are relative in Paper.js)
                           const cp1x = p1.x + h1.x;
                           const cp1y = p1.y + h1.y;
                           const cp2x = p2.x + h2.x;
                           const cp2y = p2.y + h2.y;
                           
                           doc.curveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
                       });
                       
                       if (item.closed) {
                         doc.close();
                       }
                       doc.stroke();
                   }
              }
          });
      }

      doc.save('contour-crafted-export.pdf');
    },
    undo: () => {
        if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            restoreHistory(historyRef.current[historyIndexRef.current]);
            notifyHistoryChange();
        }
    },
    redo: () => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            restoreHistory(historyRef.current[historyIndexRef.current]);
            notifyHistoryChange();
        }
    }
  }));

  const updateSegmentCount = (scope: paper.PaperScope) => {
    if (!onPathChange) return;
    const pathsGroup = scope.project.getItem({ name: 'outlines' });
    let count = 0;
    if (pathsGroup && pathsGroup.children) {
        pathsGroup.children.forEach(item => {
            if (item instanceof paper.Path) count += item.segments.length;
        });
    }
    onPathChange(count);
  };

  // 1. Initialize Paper.js Scope and Tool
  useEffect(() => {
    if (!canvasRef.current) return;

    const scope = new paper.PaperScope();
    scope.setup(canvasRef.current);
    scopeRef.current = scope;

    const tool = new scope.Tool();
    tool.activate();

    let segment: paper.Segment | null = null;
    let lastClickTime = 0;
    let isDragging = false;
    
    const hitOptions = {
      segments: true,
      stroke: true,
      fill: false, 
      tolerance: 5
    };

    tool.onMouseDown = (event: paper.ToolEvent) => {
      segment = null;
      isDragging = false;

      // Double-click detection
      const now = Date.now();
      const isDoubleClick = now - lastClickTime < 300; 
      lastClickTime = now;
      
      const hitResult = scope.project.hitTest(event.point, hitOptions);

      if (!hitResult) return;

      if (isDoubleClick) {
          if (hitResult.type === 'segment') {
              hitResult.segment.remove();
              updateSegmentCount(scope);
              saveHistory(scope); // Save on delete
              return;
          }
      }

      if (hitResult.type === 'segment') {
        segment = hitResult.segment;
      } else if (hitResult.type === 'stroke') {
        const location = hitResult.location;
        if (location && hitResult.item instanceof scope.Path) {
            // Add Node
            segment = hitResult.item.insert(location.index + 1, event.point);
            updateSegmentCount(scope);
            saveHistory(scope); // Save on insert
        }
      }
    };

    tool.onMouseDrag = (event: paper.ToolEvent) => {
      if (segment) {
        isDragging = true;
        segment.point.x += event.delta.x;
        segment.point.y += event.delta.y;
      }
    };

    tool.onMouseUp = () => {
        if (isDragging) {
            saveHistory(scope); // Save on drag end
        }
        isDragging = false;
        segment = null;
    };

    return () => {
      tool.remove();
      if (scope.project) {
        scope.project.remove();
      }
    };
  }, []);

  // 2. Generate Data
  useEffect(() => {
    if (!appState.imageUrl) return;
    
    const process = async () => {
      setIsProcessing(true);
      try {
        const img = await loadImage(appState.imageUrl!);
        const coords = generateOutlineCoordinates(img, appState.blurRadius, appState.threshold);
        setProcessedPathData(coords);
      } catch (err) {
        console.error("Processing failed", err);
      } finally {
        setIsProcessing(false);
      }
    };

    process();
    
    // Reset History when a new image is loaded (new source data)
    historyRef.current = [];
    historyIndexRef.current = -1;
    notifyHistoryChange();

  }, [appState.imageUrl, appState.blurRadius, appState.threshold]);

  // 3. Render Geometry (Destructive)
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !appState.imageUrl || !processedPathData) return;

    scope.project.activeLayer.removeChildren();

    const raster = new paper.Raster(appState.imageUrl);
    raster.name = 'mainImage';
    raster.locked = true; 
    
    raster.onLoad = () => {
       raster.position = new paper.Point(appState.imageWidth / 2, appState.imageHeight / 2);
       raster.opacity = appState.showOriginal ? 1 : 0.4;
       raster.sendToBack();

       const pathsGroup = new paper.Group();
       pathsGroup.name = 'outlines';

       processedPathData.forEach(ring => {
            const path = new paper.Path({
                segments: ring.map(pt => new paper.Point(pt[0], pt[1])),
                closed: true,
                strokeCap: 'round',
                strokeJoin: 'round'
            });

            path.strokeColor = new paper.Color(appState.strokeColor);
            path.strokeColor.alpha = appState.strokeOpacity;
            path.fillColor = new paper.Color(appState.fillColor);
            path.fillColor.alpha = appState.fillOpacity;
            path.strokeWidth = appState.strokeWidth;

            if (appState.simplification > 0) {
                path.simplify(appState.simplification);
            }

            path.fullySelected = appState.showPoints;
            pathsGroup.addChild(path);
       });

       scope.view.center = new paper.Point(appState.imageWidth / 2, appState.imageHeight / 2);
       const padding = 50;
       const scaleX = (scope.view.viewSize.width - padding) / appState.imageWidth;
       const scaleY = (scope.view.viewSize.height - padding) / appState.imageHeight;
       scope.view.zoom = Math.min(scaleX, scaleY, 1);
       
       updateSegmentCount(scope);
       
       // Initial save for this generation
       saveHistory(scope);
    };

  }, [processedPathData, appState.simplification, appState.imageUrl, appState.imageWidth, appState.imageHeight]);

  // 4. Update Styles (Non-Destructive)
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const raster = scope.project.getItem({ name: 'mainImage' });
    if (raster) {
        raster.opacity = appState.showOriginal ? 1 : 0.4;
    }

    const pathsGroup = scope.project.getItem({ name: 'outlines' });
    if (pathsGroup) {
        applyStyles(pathsGroup);
    }

  }, [
      appState.showOriginal, 
      appState.showPoints, 
      appState.strokeColor, 
      appState.strokeOpacity, 
      appState.fillColor, 
      appState.fillOpacity, 
      appState.strokeWidth
  ]);

  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden flex items-center justify-center">
      {isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="text-white font-medium animate-pulse">Processing Outline...</div>
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        data-paper-resize
        className="w-full h-full cursor-crosshair"
      />
    </div>
  );
});

EditorCanvas.displayName = 'EditorCanvas';
export default EditorCanvas;