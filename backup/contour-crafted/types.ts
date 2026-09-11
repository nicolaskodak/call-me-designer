export interface Point {
    x: number;
    y: number;
  }
  
  export interface AppState {
    imageUrl: string | null;
    imageWidth: number;
    imageHeight: number;
    // Processing parameters
    blurRadius: number; // Controls the "spread" potential
    threshold: number;  // Controls the "distance" (lower threshold on blurred alpha = wider outline)
    simplification: number; // Paper.js simplify tolerance
    showOriginal: boolean;
    showPoints: boolean;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeWidth: number;
  }
  
  export const DEFAULT_STATE: AppState = {
    imageUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    blurRadius: 15,
    threshold: 10, // Low threshold = Outer boundary
    simplification: 2,
    showOriginal: true,
    showPoints: true,
    fillColor: '#3b82f6', // blue-500
    fillOpacity: 0.3,     // Transparent by default to see image
    strokeColor: '#ef4444', // red-500
    strokeOpacity: 1.0,
    strokeWidth: 3,
  };