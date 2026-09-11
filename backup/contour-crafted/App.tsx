import React, { useState, useRef, useCallback } from 'react';
import EditorCanvas, { EditorCanvasHandle } from './components/EditorCanvas';
import Controls from './components/Controls';
import { AppState, DEFAULT_STATE } from './types';
import { loadImage } from './utils/imageProcessing';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [segmentCount, setSegmentCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const editorRef = useRef<EditorCanvasHandle>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        setAppState(prev => ({
          ...prev,
          imageUrl: url,
          imageWidth: img.width,
          imageHeight: img.height,
          // Reset somewhat on new image but keep preferences
          threshold: 10,
          blurRadius: 15
        }));
        // Reset undo/redo state when new image loads
        setCanUndo(false);
        setCanRedo(false);
      } catch (err) {
        console.error("Failed to load image", err);
        alert("Failed to load image. Please try a valid PNG.");
      }
    }
  };

  const handleExport = () => {
    if (editorRef.current) {
      editorRef.current.exportSVG();
    }
  };

  const handleExportPDF = () => {
      if (editorRef.current) {
          editorRef.current.exportPDF();
      }
  };

  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();

  const onHistoryChange = useCallback((u: boolean, r: boolean) => {
      setCanUndo(u);
      setCanRedo(r);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Controls 
        appState={appState} 
        setAppState={setAppState} 
        onUpload={handleUpload}
        onExport={handleExport}
        onExportPDF={handleExportPDF}
        segmentCount={segmentCount}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      
      <main className="flex-1 relative h-full bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] bg-neutral-900">
        {!appState.imageUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
            <div className="w-24 h-24 mb-4 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center opacity-50">
               <span className="text-4xl">🖼️</span>
            </div>
            <p className="text-lg font-medium">No Image Loaded</p>
            <p className="text-sm opacity-60">Upload a PNG to start generating outlines.</p>
          </div>
        ) : (
          <EditorCanvas 
            ref={editorRef}
            appState={appState} 
            onPathChange={setSegmentCount}
            onHistoryChange={onHistoryChange}
          />
        )}
      </main>
    </div>
  );
};

export default App;