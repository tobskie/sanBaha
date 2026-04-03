import { useState } from 'react';
import App from './App';

const MobileSimulator = () => {
    const [device, setDevice] = useState('iphone14');

    const devices = {
        iphone14: { name: 'iPhone 14', width: 390, height: 844 },
        iphone14pro: { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
        iphoneSE: { name: 'iPhone SE', width: 375, height: 667 },
        pixel7: { name: 'Pixel 7', width: 412, height: 915 },
        galaxyS23: { name: 'Galaxy S23', width: 360, height: 780 },
    };

    const currentDevice = devices[device];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-8">
            {/* Device Selector */}
            <div className="mb-6 flex items-center gap-4">
                <label className="text-white text-sm font-medium">Device:</label>
                <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:border-cyan-400"
                >
                    {Object.entries(devices).map(([key, { name }]) => (
                        <option key={key} value={key}>{name}</option>
                    ))}
                </select>
                <span className="text-slate-400 text-sm">
                    {currentDevice.width} × {currentDevice.height}
                </span>
            </div>

            {/* Phone Frame */}
            <div
                className="relative bg-black rounded-[3rem] p-3 shadow-2xl shadow-black/50"
                style={{
                    width: currentDevice.width + 24,
                }}
            >
                {/* Dynamic Island / Notch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-[100]" />

                {/* Screen Container - This is the key fix */}
                <div
                    className="relative rounded-[2.5rem] overflow-hidden isolate"
                    style={{
                        width: currentDevice.width,
                        height: currentDevice.height,
                        transform: 'translateZ(0)', // Creates new stacking context
                    }}
                >
                    {/* App Content - Wrapped in a container that resets positioning context */}
                    <div
                        className="absolute inset-0 overflow-hidden"
                        style={{
                            // This creates a new containing block for fixed elements
                            transform: 'translateZ(0)',
                            containIntrinsicSize: `${currentDevice.width}px ${currentDevice.height}px`,
                        }}
                    >
                        <App />
                    </div>

                    {/* Home Indicator */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full z-[9999] pointer-events-none" />
                </div>

                {/* Phone Side Buttons */}
                <div className="absolute -right-1 top-32 w-1 h-16 bg-slate-700 rounded-l" />
                <div className="absolute -left-1 top-24 w-1 h-8 bg-slate-700 rounded-r" />
                <div className="absolute -left-1 top-36 w-1 h-12 bg-slate-700 rounded-r" />
                <div className="absolute -left-1 top-52 w-1 h-12 bg-slate-700 rounded-r" />
            </div>

            {/* Instructions */}
            <div className="mt-6 text-center">
                <p className="text-slate-400 text-sm">
                    📱 Mobile Simulator • Drag the bottom sheet up to expand
                </p>
                <p className="text-slate-500 text-xs mt-2">
                    Tap on map markers or sensor cards to interact
                </p>
            </div>
        </div>
    );
};

export default MobileSimulator;
