import React from 'react';
import { Settings2, Upload, Trash2, MousePointer2, Info, Download, RotateCcw, RotateCw, FileText } from 'lucide-react';
import { ActiveTab, AppState, MockupState } from '../types';

interface ControlsProps {
  activeTab: ActiveTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMockupUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mockupState: MockupState;
  setMockupState: React.Dispatch<React.SetStateAction<MockupState>>;
  onSetLayerTotalCount: (layerId: string, totalCount: number) => void;
  onAutoLayout: () => void;
  onExport: () => void;
  onExportPDF: () => void;
  segmentCount: number;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Controls: React.FC<ControlsProps> = ({ 
    activeTab,
    setActiveTab,
    appState,
    setAppState,
    onUpload,
    onMockupUpload,
    mockupState,
    setMockupState,
    onSetLayerTotalCount,
    onAutoLayout,
    onExport,
    onExportPDF,
    segmentCount,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}) => {
  
  const handleChange = <K extends keyof AppState>(key: K, value: AppState[K]) => {
    setAppState(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="w-80 bg-neutral-800 border-l border-neutral-700 flex flex-col h-full overflow-y-auto text-sm select-none">
      
      {/* Header */}
      <div className="p-4 border-b border-neutral-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-500" />
          Contour Crafted
        </h1>
        <p className="text-neutral-400 text-xs mt-1">PNG Outline Generator & Editor</p>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-2 rounded text-xs transition border ${
              activeTab === 'editor'
                ? 'bg-neutral-700 text-white border-neutral-600'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700/40'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab('mockup')}
            className={`flex-1 py-2 rounded text-xs transition border ${
              activeTab === 'mockup'
                ? 'bg-neutral-700 text-white border-neutral-600'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700/40'
            }`}
          >
            Mockup
          </button>
        </div>
      </div>

      {/* Upload */}
      <div className="p-4 border-b border-neutral-700">
        {activeTab === 'editor' ? (
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer group">
            <div className="flex flex-col items-center justify-center pt-2 pb-3">
              <Upload className="w-8 h-8 mb-2 text-neutral-500 group-hover:text-blue-400" />
              <p className="text-xs text-neutral-400 group-hover:text-neutral-200">
                <span className="font-semibold">Click to upload</span> or drag PNG
              </p>
            </div>
            <input type="file" className="hidden" accept="image/png" onChange={onUpload} />
          </label>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer group">
            <div className="flex flex-col items-center justify-center pt-2 pb-3">
              <Upload className="w-8 h-8 mb-2 text-neutral-500 group-hover:text-blue-400" />
              <p className="text-xs text-neutral-400 group-hover:text-neutral-200 text-center">
                <span className="font-semibold">Click to upload</span> image + SVG (multiple)
              </p>
              <p className="text-[10px] text-neutral-500 mt-1 text-center">
                Pairing: same filename stem (cat.png + cat.svg)
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*,image/svg+xml,.svg"
              onChange={onMockupUpload}
            />
          </label>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-6 flex-1">
        {activeTab === 'mockup' ? (
          <>
            <div className="space-y-4">
              <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Mockup Boundary</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-neutral-400 text-xs">Width (px)</label>
                  <input
                    type="number"
                    min={100}
                    value={mockupState.boundaryWidth}
                    onChange={(e) =>
                      setMockupState(prev => ({
                        ...prev,
                        boundaryWidth: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-400 text-xs">Height (px)</label>
                  <input
                    type="number"
                    min={100}
                    value={mockupState.boundaryHeight}
                    onChange={(e) =>
                      setMockupState(prev => ({
                        ...prev,
                        boundaryHeight: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700">
                <span className="text-neutral-400 text-xs">Items</span>
                <span className="text-white font-mono text-xs">{mockupState.instances.length}</span>
              </div>
            </div>

            <div className="h-px bg-neutral-700" />

            <div className="space-y-3">
              <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Layout</h2>

              <div className="space-y-1">
                <label className="text-neutral-400 text-xs">Min Gap (px)</label>
                <input
                  type="number"
                  min={0}
                  value={mockupState.minGap}
                  onChange={(e) =>
                    setMockupState(prev => ({
                      ...prev,
                      minGap: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs"
                />
              </div>

              <label className="flex items-center justify-between gap-3 p-2 bg-neutral-700/30 rounded border border-neutral-700">
                <span className="text-neutral-400 text-xs">允許 90° 旋轉</span>
                <input
                  type="checkbox"
                  checked={mockupState.allowRotate90}
                  onChange={(e) =>
                    setMockupState(prev => ({
                      ...prev,
                      allowRotate90: e.target.checked,
                      instances: e.target.checked
                        ? prev.instances
                        : prev.instances.map(i => ({ ...i, rotationDeg: 0 })),
                      notPlacedInstanceIds: [],
                      lastLayoutMessage: null,
                    }))
                  }
                  className="h-4 w-4"
                />
              </label>

              <button
                onClick={onAutoLayout}
                disabled={mockupState.instances.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white py-2 rounded text-xs transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                排圖
              </button>

              {mockupState.lastLayoutMessage ? (
                <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">
                  {mockupState.lastLayoutMessage}
                </div>
              ) : null}
            </div>

            <div className="h-px bg-neutral-700" />

            <div className="space-y-3">
              <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Layers</h2>

              {mockupState.layers.length === 0 ? (
                <div className="text-[10px] text-neutral-500">No layers yet. Upload image + SVG pairs.</div>
              ) : (
                <div className="space-y-2">
                  {mockupState.layers.map(layer => (
                    <div key={layer.id} className="flex items-center gap-2 p-2 rounded bg-neutral-700/20 border border-neutral-700">
                      <img
                        src={layer.imageUrl}
                        alt={layer.name}
                        className="w-8 h-8 rounded object-contain bg-neutral-900"
                        draggable={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-neutral-200 text-xs truncate">{layer.name}</div>
                        <div className="text-[10px] text-neutral-500">
                          {layer.width}×{layer.height}
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300">
                        SVG
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] text-neutral-400">總數</div>
                        <input
                          type="number"
                          min={0}
                          value={layer.totalCount}
                          onChange={(e) => onSetLayerTotalCount(layer.id, Number(e.target.value) || 0)}
                          className="w-16 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white text-xs"
                          title="總數為 1 代表只有 1 個；設為 0 代表刪除該圖層"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>

        {/* Processing Group */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Generation Settings</h2>
            <div className="group relative">
                <Info className="w-3 h-3 text-neutral-500 cursor-help" />
                <div className="absolute right-0 w-48 p-2 bg-neutral-900 border border-neutral-700 rounded shadow-xl text-xs text-neutral-400 opacity-0 group-hover:opacity-100 transition pointer-events-none z-50">
                    Blur creates the offset area. Threshold cuts it. Adjust both to find the perfect outline distance.
                </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
                <label className="text-neutral-400">Offset Distance (Blur)</label>
                <span className="text-blue-400">{appState.blurRadius}px</span>
            </div>
            <input 
              type="range" min="0" max="50" step="1"
              value={appState.blurRadius}
              onChange={(e) => handleChange('blurRadius', parseInt(e.target.value))}
              className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
                <label className="text-neutral-400">Tightness (Threshold)</label>
                <span className="text-blue-400">{appState.threshold}</span>
            </div>
            <input 
              type="range" min="1" max="100" step="1"
              value={appState.threshold}
              onChange={(e) => handleChange('threshold', parseInt(e.target.value))}
              className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            />
            <p className="text-[10px] text-neutral-500">Lower = Wider outline, Higher = Tighter</p>
          </div>
        </div>

        <div className="h-px bg-neutral-700" />

        {/* Vector Settings */}
        <div className="space-y-4">
          <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Path Editing</h2>

          {/* Undo/Redo Buttons */}
          <div className="flex gap-2">
            <button 
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-xs transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
            >
                <RotateCcw className="w-3 h-3" />
                Undo
            </button>
            <button 
                onClick={onRedo}
                disabled={!canRedo}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-xs transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Shift+Z)"
            >
                <RotateCw className="w-3 h-3" />
                Redo
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
                <label className="text-neutral-400">Smoothness</label>
                <span className="text-blue-400">{appState.simplification}</span>
            </div>
            <input 
              type="range" min="0" max="20" step="0.5"
              value={appState.simplification}
              onChange={(e) => handleChange('simplification', parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
            />
          </div>

          <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700">
             <span className="text-neutral-400 text-xs">Node Count</span>
             <span className="text-white font-mono text-xs">{segmentCount}</span>
          </div>
        </div>

        <div className="h-px bg-neutral-700" />

        {/* Visibility */}
        <div className="space-y-4">
            <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">Appearance</h2>
            
            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="showOriginal"
                    checked={appState.showOriginal}
                    onChange={(e) => handleChange('showOriginal', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-neutral-700 text-blue-600 focus:ring-blue-600 ring-offset-neutral-800"
                />
                <label htmlFor="showOriginal" className="text-neutral-300">Show Original Image</label>
            </div>

            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="showPoints"
                    checked={appState.showPoints}
                    onChange={(e) => handleChange('showPoints', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-neutral-700 text-blue-600 focus:ring-blue-600 ring-offset-neutral-800"
                />
                <label htmlFor="showPoints" className="text-neutral-300">Show Editable Nodes</label>
            </div>

             <div className="space-y-4 pt-2">
                 <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs text-neutral-400">Stroke Color & Opacity</label>
                        <span className="text-[10px] text-neutral-500 font-mono">{Math.round(appState.strokeOpacity * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="color" 
                            value={appState.strokeColor} 
                            onChange={(e) => handleChange('strokeColor', e.target.value)} 
                            className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" 
                        />
                        <input 
                            type="range" min="0" max="1" step="0.05"
                            value={appState.strokeOpacity}
                            onChange={(e) => handleChange('strokeOpacity', parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-neutral-400 hover:accent-white"
                        />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs text-neutral-400">Fill Color & Opacity</label>
                        <span className="text-[10px] text-neutral-500 font-mono">{Math.round(appState.fillOpacity * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="color" 
                            value={appState.fillColor} 
                            onChange={(e) => handleChange('fillColor', e.target.value)} 
                            className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" 
                        />
                        <input 
                            type="range" min="0" max="1" step="0.05"
                            value={appState.fillOpacity}
                            onChange={(e) => handleChange('fillOpacity', parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-neutral-400 hover:accent-white"
                        />
                    </div>
                 </div>
             </div>
        </div>

        {/* Actions */}
        <div className="pt-4 mt-auto space-y-2">
             <button 
                onClick={onExport}
                className="w-full flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white py-3 rounded-lg font-medium transition shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!appState.imageUrl}
             >
                <Download className="w-4 h-4" />
                Export SVG
             </button>

             <button 
                onClick={onExportPDF}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition shadow-lg shadow-blue-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!appState.imageUrl}
             >
                <FileText className="w-4 h-4" />
                Export PDF
             </button>
        </div>

          </>
        )}

      </div>

      {/* Footer Instructions */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-700 text-[10px] text-neutral-500 space-y-2">
        {activeTab === 'editor' ? (
          <>
            <div className="flex items-start gap-2">
                <MousePointer2 className="w-3 h-3 mt-0.5" />
                <span>Drag nodes to adjust shape.</span>
            </div>
            <div className="flex items-start gap-2">
                <Trash2 className="w-3 h-3 mt-0.5" />
                <span>Double-click a node to delete it.</span>
            </div>
            <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full border border-neutral-600 mt-0.5 flex items-center justify-center text-[8px]">+</div>
                <span>Click on line to add a node.</span>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <MousePointer2 className="w-3 h-3 mt-0.5" />
            <span>Drag a pair to reposition it.</span>
          </div>
        )}
      </div>

    </div>
  );
};

export default Controls;