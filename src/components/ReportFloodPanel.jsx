import { useState, useEffect } from 'react';
import MediaUpload from './MediaUpload';
import { hasMediaConsent, setMediaConsent } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

const ReportFloodPanel = ({
    isOpen,
    onClose,
    userLocation,
    onSubmit,
    onError
}) => {
    const [severity, setSeverity] = useState('warning');
    const [description, setDescription] = useState('');
    const [locationName, setLocationName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const { user } = useAuth();
    const [mediaFile, setMediaFile] = useState(null);
    const [showConsentPrompt, setShowConsentPrompt] = useState(false);

    // Get location name from coordinates
    useEffect(() => {
        if (userLocation && isOpen) {
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${userLocation[0]},${userLocation[1]}.json?access_token=pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw&limit=1`)
                .then(res => res.json())
                .then(data => {
                    if (data.features?.[0]) {
                        setLocationName(data.features[0].place_name);
                    }
                })
                .catch(() => setLocationName('Current Location'));
        }
    }, [userLocation, isOpen]);

    const handleSubmit = async () => {
        if (!userLocation) {
            if (onError) onError('Unable to get your location. Please enable GPS.');
            return;
        }

        // Consent check for media
        if (mediaFile && user) {
            const consented = await hasMediaConsent(user.uid);
            if (!consented) {
                setShowConsentPrompt(true);
                return;
            }
        }

        setIsSubmitting(true);

        const report = {
            type: 'crowdsourced',
            coordinates: [userLocation[1], userLocation[0]],
            severity,
            description: description || getSeverityLabel(severity),
            locationName: locationName || 'Unknown Location',
            reportedAt: new Date().toISOString(),
            reporterId: user?.uid || 'anonymous',
            upvotes: 0,
            verified: false,
        };

        onSubmit(report, mediaFile);
        setIsSubmitting(false);
        setShowSuccess(true);

        setTimeout(() => {
            setShowSuccess(false);
            onClose();
            setSeverity('warning');
            setDescription('');
            setMediaFile(null);
        }, 2000);
    };

    const getSeverityLabel = (sev) => {
        switch (sev) {
            case 'clear': return 'Road is clear, passable';
            case 'warning': return 'Slight flooding, proceed with caution';
            case 'flooded': return 'Heavy flooding, not passable';
            default: return '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[2000] flex items-end justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-h-[85%] glass rounded-t-3xl p-4 animate-slide-up overflow-y-auto">
                {/* Success State */}
                {showSuccess ? (
                    <div className="py-12 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">Report Submitted!</h3>
                        <p className="text-sm text-slate-400">Thank you for helping your community stay safe.</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-base">Report Flood</h3>
                                    <p className="text-[10px] text-slate-400">Help others avoid flooded areas</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Location */}
                        <div className="p-3 bg-[#0a1628] rounded-xl mb-4">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#00d4ff]/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-[#00d4ff]" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 mb-0.5">Your Location</p>
                                    <p className="text-sm text-white line-clamp-2">{locationName || 'Getting location...'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Severity Selection */}
                        <div className="mb-4">
                            <label className="block text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
                                Flood Severity
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { key: 'clear', label: 'Clear', color: 'emerald', icon: '✓' },
                                    { key: 'warning', label: 'Warning', color: 'amber', icon: '⚠' },
                                    { key: 'flooded', label: 'Flooded', color: 'red', icon: '🚫' },
                                ].map((option) => (
                                    <button
                                        key={option.key}
                                        onClick={() => setSeverity(option.key)}
                                        className={`
                      p-3 rounded-xl border-2 transition-all
                      ${severity === option.key
                                                ? option.color === 'emerald'
                                                    ? 'border-emerald-500 bg-emerald-500/20'
                                                    : option.color === 'amber'
                                                        ? 'border-amber-500 bg-amber-500/20'
                                                        : 'border-red-500 bg-red-500/20'
                                                : 'border-[#162d4d] bg-[#0a1628]'
                                            }
                    `}
                                    >
                                        <span className="text-2xl block mb-1">{option.icon}</span>
                                        <span className={`text-xs font-medium ${severity === option.key
                                                ? option.color === 'emerald'
                                                    ? 'text-emerald-300'
                                                    : option.color === 'amber'
                                                        ? 'text-amber-300'
                                                        : 'text-red-300'
                                                : 'text-slate-400'
                                            }`}>
                                            {option.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mb-4">
                            <label className="block text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
                                Description (Optional)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={getSeverityLabel(severity)}
                                rows={3}
                                className="w-full px-4 py-3 bg-[#0a1628] border border-[#162d4d] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30 resize-none"
                            />
                        </div>

                        {/* Media Attachment */}
                        <div className="mb-4">
                            <label className="block text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
                                Photo / Video
                            </label>
                            <MediaUpload onChange={setMediaFile} disabled={isSubmitting} />
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !userLocation}
                            className={`
                w-full py-3.5 rounded-xl font-semibold text-sm
                flex items-center justify-center gap-2 transition-all
                ${isSubmitting
                                    ? 'bg-[#162d4d] text-slate-500'
                                    : 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628] active:scale-[0.98]'
                                }
              `}
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                    Submit Report
                                </>
                            )}
                        </button>

                        {/* Disclaimer */}
                        <p className="mt-3 text-[10px] text-slate-500 text-center">
                            Your report helps keep the community safe. Reports are anonymous.
                        </p>

                        {/* Consent Prompt */}
                        {showConsentPrompt && (
                            <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6">
                                <div className="absolute inset-0 bg-black/80" onClick={() => setShowConsentPrompt(false)} />
                                <div className="relative glass-card rounded-2xl p-5 max-w-xs">
                                    <p className="text-sm text-white mb-3">
                                        Your photo/video, name, and location will be stored by sanBaha and visible to authorized emergency responders. It will not be shared publicly.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            className="flex-1 py-2 rounded-lg bg-[#162d4d] text-slate-300 text-sm"
                                            onClick={() => setShowConsentPrompt(false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628] text-sm font-semibold"
                                            onClick={async () => {
                                                await setMediaConsent(user.uid);
                                                setShowConsentPrompt(false);
                                                handleSubmit();
                                            }}
                                        >
                                            I Agree
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ReportFloodPanel;
