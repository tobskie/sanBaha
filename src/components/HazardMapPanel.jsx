import React from 'react';

function HazardMapPanel({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[2001] flex flex-col bg-[#0a1628] animate-slide-up">
      {/* Header */}
      <div className="glass-card p-4 border-b border-[#00d4ff]/10 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#162d4d] flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-white">UP NOAH Hazard Map</h2>
        </div>
      </div>

      {/* Content - Redirect Panel */}
      <div className="flex-1 w-full h-full relative relative bg-[#0a1628] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-3">UP NOAH Studio</h3>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-xs">
             Explore 100-year flood overlays and 3D terrain from the official UP NOAH detailed map viewer.
          </p>

          <a 
            href="https://noah.up.edu.ph/noah-studio"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-xs p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-center flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-blue-500/20"
          >
            <span>Open NOAH Studio</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <div className="mt-auto pt-8">
            <p className="text-[10px] text-slate-500">
               Data, maps, and information provided by and attributed to the 
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
               University of the Philippines Nationwide Operational Assessment of Hazards (UP NOAH).
            </p>
          </div>
      </div>
    </div>
  );
}

export default HazardMapPanel;
