'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as WebIFC from 'web-ifc';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { 
  Upload, Box, Database, CheckCircle2, 
  Trash2, ChevronLeft, ChevronRight, Maximize2, Move
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Spinner from '../Spinner';

// Constants for IFC Schema
const IFC_PRODUCT = 111161726; // Base for most building elements
const IFC_WALL = 4057008104;
const IFC_SLAB = 1968832103;
const IFC_COLUMN = 3088006856;
const IFC_BEAM = 2275001601;

export default function IfcVolumeExtractor({ 
  onClose, 
  projectId, 
  ahspItems, // Items to map the volume to
  onSuccess 
}) {
  const [loading, setLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [extractedData, setExtractedData] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [targetAhspId, setTargetAhspId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Refs for 3D Viewer
  const containerRef = useRef();
  const sceneRef = useRef();
  const rendererRef = useRef();
  const ifcApiRef = useRef();

  // 1. Initialize IFC API
  useEffect(() => {
    const ifcApi = new WebIFC.IfcAPI();
    
    // Set path to WASM file. 
    // Tip: If you still get 404/WASM errors, please restart your 'npm run dev' 
    // to let Next.js refresh the public directory assets.
    ifcApi.SetWasmPath(window.location.origin + '/');
    
    ifcApi.Init().then(() => {
      ifcApiRef.current = ifcApi;
    }).catch(err => {
      console.error("WASM Init Error:", err);
    });

    return () => {
      if (ifcApiRef.current) {
        // Cleanup if needed
      }
    };
  }, []);

  // 2. Scene Setup
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // slate-100
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(10, 10, 10);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      const currentContainer = containerRef.current;
      if (currentContainer?.contains(renderer.domElement)) {
        currentContainer.removeChild(renderer.domElement);
      }
    };
  }, [modelLoaded]);

  // 3. Load & Process IFC
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const ifcApi = ifcApiRef.current;
        const modelID = ifcApi.OpenModel(data);

        // A. Extract Geometry (Basic implementation)
        // Note: For full geometry rendering we would use IfcGeometryConverter 
        // but for volume extraction we focus on Properties.
        const meshes = ifcApi.LoadAllGeometry(modelID);
        const meshGroup = new THREE.Group();
        
        meshes.forEach((mesh) => {
          const geo = new THREE.BufferGeometry();
          // Conversion of flat mesh data to ThreeJS geometry would go here
          // This is complex, so let's focus on the Volume Data extraction first
        });

        // B. Data Extraction Helpers
        const getPropertySets = (expressID) => {
          const propertySets = [];
          const rels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
          for (let i = 0; i < rels.size(); i++) {
            const relID = rels.get(i);
            const rel = ifcApi.GetLine(modelID, relID);
            
            // Check if this relation applies to our element
            const relatedObjects = rel.RelatedObjects;
            const isRelated = relatedObjects.some(obj => obj.value === expressID);
            
            if (isRelated) {
              const propSet = ifcApi.GetLine(modelID, rel.RelatingPropertyDefinition.value);
              propertySets.push(propSet);
            }
          }
          return propertySets;
        };

        const extractVolumeFromSets = (propSets) => {
          for (const set of propSets) {
            // Check if it's an IfcElementQuantity
            if (set.type === WebIFC.IFCELEMENTQUANTITY || set.Quantities) {
              const quantities = set.Quantities || [];
              for (const qRef of quantities) {
                const q = ifcApi.GetLine(modelID, qRef.value);
                // Look for Volume
                if (q.type === WebIFC.IFCQUANTITYVOLUME) {
                  return q.VolumeValue?.value || 0;
                }
              }
            }
            // Fallback: Check standard property sets for "Volume" naming
            if (set.HasProperties) {
              for (const pRef of set.HasProperties) {
                const p = ifcApi.GetLine(modelID, pRef.value);
                if (p.Name?.value?.toLowerCase().includes('volume')) {
                   return p.NominalValue?.value || 0;
                }
              }
            }
          }
          return 0;
        };

        const elements = [];
        const extractByType = (ifcType) => {
          const ids = ifcApi.GetLineIDsWithType(modelID, ifcType);
          for (let i = 0; i < ids.size(); i++) {
            const id = ids.get(i);
            const props = ifcApi.GetLine(modelID, id);
            
            // Get Volume from relations
            const propSets = getPropertySets(id);
            const volume = extractVolumeFromSets(propSets);

            elements.push({
              id,
              type: ifcApi.GetTypeName(ifcType),
              name: props.Name?.value || `${ifcApi.GetTypeName(ifcType)} #${id}`,
              volume: parseFloat(volume.toFixed(3)),
              category: mapIfcTypeToCategory(ifcApi.GetTypeName(ifcType))
            });
          }
        };

        // Standard Building Elements
        [WebIFC.IFCWALL, WebIFC.IFCSLAB, WebIFC.IFCCOLUMN, WebIFC.IFCBEAM, WebIFC.IFCFOOTING].forEach(type => {
            try { extractByType(type); } catch (e) {}
        });

        setExtractedData(elements);
        setModelLoaded(true);
        setLoading(false);
      } catch (err) {
        console.error("IFC Load Error:", err);
        alert("Gagal memuat file IFC: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const mapIfcTypeToCategory = (type) => {
    if (type.includes('WALL')) return 'Dinding';
    if (type.includes('SLAB')) return 'Lantai/Plat';
    if (type.includes('COLUMN')) return 'Kolom';
    if (type.includes('BEAM')) return 'Balok';
    if (type.includes('FOOTING')) return 'Pondasi';
    return 'Lainnya';
  };

  // 4. Mapping Logic
  const handleApplyToRab = async () => {
    if (!selectedElement || !targetAhspId) {
      alert("Pilih elemen IFC dan item RAB tujuan!");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('project_backup_volume').insert({
        project_id: projectId,
        line_id: targetAhspId,
        uraian: `[IFC] ${selectedElement.name} (${selectedElement.type})`,
        qty: 1,
        p: 1, l: 1, t: 1, // volume is directly in konversi or total
        konversi: selectedElement.volume,
        total: selectedElement.volume
      });

      if (error) throw error;
      
      alert(`Volume ${selectedElement.volume} m3 berhasil dimasukkan ke RAB!`);
      if (onSuccess) onSuccess();
      setSelectedElement(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!searchQuery) return extractedData;
    return extractedData.filter(it => 
      it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [extractedData, searchQuery]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 lg:p-10">
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" 
        onClick={onClose} 
      />
      
      <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-[22px] flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <Box className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">BIM IFC Volume Extractor</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ekstraksi Volume Bangunan Otomatis (NetVolume)</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            <ChevronLeft className="w-6 h-6 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {!modelLoaded ? (
          /* Upload State */
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="max-w-md w-full text-center space-y-8">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
                <div className="relative w-24 h-24 bg-indigo-50 dark:bg-slate-800 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                  {loading ? <Spinner className="w-10 h-10 text-indigo-600" /> : <Upload className="w-10 h-10 text-indigo-600" />}
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">Upload File IFC</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-bold uppercase tracking-widest px-8">
                  Pilih file .ifc bangunan Anda. Pastikan opsi &quot;Base Quantities&quot; aktif saat ekspor dari BIM Software.
                </p>
              </div>

              <div className="relative group">
                <input 
                  type="file" 
                  accept=".ifc" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 px-8 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl group-hover:scale-105 transition-all">
                  Pilih File IFC
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Viewer State */
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left: 3D Viewer */}
            <div className="flex-1 relative bg-slate-100 dark:bg-black/20">
               <div ref={containerRef} className="w-full h-full" />
               <div className="absolute top-6 left-6 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg pointer-events-none">
                  <div className="flex items-center gap-3">
                    <Move className="w-4 h-4 text-indigo-500" />
                    <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">Gunakan Mouse untuk Navigasi (Orbit/Zoom)</span>
                  </div>
               </div>
            </div>

            {/* Right: Data & Mapping Panel */}
            <div className="w-96 border-l border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-xl shrink-0">
               
               {/* Search */}
               <div className="p-6 space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Daftar Elemen Terdeteksi
                  </h4>
                  <input 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Cari Dinding, Kolom, atau Nama Elemen..."
                    className="w-full bg-white dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
                  />
               </div>

               {/* Elements List */}
               <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
                  {filteredData.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedElement(item)}
                      className={`w-full p-4 rounded-2xl text-left transition-all border ${
                        selectedElement?.id === item.id 
                          ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-500/20' 
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 hover:border-indigo-300 dark:hover:border-slate-700 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${selectedElement?.id === item.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {item.category}
                        </span>
                        <div className={`px-2 py-1 rounded-lg text-[9px] font-black ${selectedElement?.id === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                           {item.volume} m³
                        </div>
                      </div>
                      <p className={`text-[11px] font-bold tracking-tight uppercase ${selectedElement?.id === item.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        {item.name}
                      </p>
                    </button>
                  ))}
               </div>

               {/* Mapping Action (Sticky at bottom if element selected) */}
               {selectedElement && (
                 <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom duration-300">
                    <div className="space-y-4">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pilih Pekerjaan AHSP Tujuan</label>
                       <select 
                         value={targetAhspId}
                         onChange={e => setTargetAhspId(e.target.value)}
                         className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold text-slate-700 dark:text-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
                       >
                          <option value="">-- Pilih AHSP --</option>
                          {ahspItems.map(it => (
                            <option key={it.id} value={it.id}>{it.uraian}</option>
                          ))}
                       </select>

                       <button
                         onClick={handleApplyToRab}
                         disabled={loading}
                         className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] py-4 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center gap-3"
                       >
                          {loading ? <Spinner className="w-3 h-3" /> : <CheckCircle2 className="w-4 h-4" />}
                          Terapkan Volume ke RAB
                       </button>
                    </div>
                 </div>
               )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
