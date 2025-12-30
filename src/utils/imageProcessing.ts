import { contours } from 'd3-contour';

/**
 * Loads an image from a URL.
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Applies a simple box blur or gaussian approx to the Alpha channel of ImageData.
 * This is used to "expand" the non-transparent area for the outline offset effect.
 */
const blurAlphaChannel = (data: Uint8ClampedArray, width: number, height: number, radius: number) => {
  if (radius <= 0) return data;

  // We only care about the Alpha channel (every 4th byte: index 3, 7, 11...)
  // We'll do a two-pass box blur (horizontal then vertical) to approximate Gaussian.
  
  const len = width * height;
  const alpha = new Uint8Array(len);
  
  // Extract alpha
  for (let i = 0; i < len; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const blurredAlpha = new Uint8Array(len);
  
  // Helper for separate horizontal/vertical passes would be ideal, 
  // but for simplicity in a single file without heavy deps, we use a simple moving average.
  // Actually, standard stack blur is better, but let's implement a simple horizontal/vertical pass.

  const temp = new Uint8Array(len);

  // Horizontal Pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const px = Math.min(width - 1, Math.max(0, x + k));
        sum += alpha[y * width + px];
        count++;
      }
      temp[y * width + x] = sum / count;
    }
  }

  // Vertical Pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const py = Math.min(height - 1, Math.max(0, y + k));
        sum += temp[py * width + x];
        count++;
      }
      blurredAlpha[y * width + x] = sum / count;
    }
  }

  // Write back to data
  for (let i = 0; i < len; i++) {
    data[i * 4 + 3] = blurredAlpha[i];
  }
};

/**
 * Generates coordinate paths for the outline.
 * 
 * Strategy:
 * 1. Draw image to canvas.
 * 2. Blur the alpha channel (radius controls smoothness/spread potential).
 * 3. Use d3-contour to find the isoband at a specific 'threshold'.
 *    - Low threshold (e.g. 5/255) on a blurred image = Wide Offset.
 *    - High threshold (e.g. 200/255) on a blurred image = Tight Offset.
 */
export const generateOutlineCoordinates = (
  img: HTMLImageElement,
  blurRadius: number,
  threshold: number // 0-255
): number[][][] => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // 1. Blur the alpha channel to create a gradient field around the object
  // A small baseline blur is always good for anti-aliasing the contour
  blurAlphaChannel(imageData.data, canvas.width, canvas.height, Math.max(1, blurRadius));

  // 2. Prepare data for d3-contour
  // d3-contour expects a 1D array of values. We normalize alpha to 0-255 (actually it is already).
  const width = canvas.width;
  const height = canvas.height;
  const values = new Float64Array(width * height);
  
  for (let i = 0; i < width * height; i++) {
    values[i] = imageData.data[i * 4 + 3];
  }

  // 3. Generate Contour
  // We want a single contour level at the specified threshold.
  const contourGenerator = contours()
    .size([width, height])
    .thresholds([threshold]); 
    
  // d3-contour allows typed arrays, but the typescript definition might expect number[].
  // Casting to any or unknown -> number[] suppresses the error.
  const contourData = contourGenerator(values as unknown as number[]);
  
  const resultPaths: number[][][] = [];

  // contourData is a MultiPolygon GeoJSON object usually.
  // Structure: [ { type: "MultiPolygon", coordinates: [ [ [ [x,y]... ] ] ] } ]
  
  if (contourData && contourData.length > 0) {
    const multiPolygon = contourData[0];
    if (multiPolygon && multiPolygon.coordinates) {
        // Flatten the structure to just arrays of points
        multiPolygon.coordinates.forEach((polygon: any) => {
            // A polygon has an exterior ring (0) and potential holes (1...)
            // We usually just want the exterior outline for a "sticker" effect, 
            // but getting all rings handles holes correctly if desired.
            // Let's grab the first ring (exterior) of each polygon part.
            polygon.forEach((ring: number[][]) => {
                resultPaths.push(ring);
            });
        });
    }
  }

  return resultPaths;
};