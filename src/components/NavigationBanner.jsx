import { useState } from 'react';
import { ManeuverIcon } from '../utils/maneuverIcons';
import { LaneGuidance } from '../utils/laneGuidance';

function formatDistance(metres) {
  if (metres == null) return '';
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  if (seconds == null) return '';
  if (seconds < 60) return '< 1 min';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function NavigationBanner({
  currentStep,
  steps,
  distanceToManeuver,
  remainingDistance,
  remainingDuration,
  destination,
  stepsWithFloodWarning,
  currentLanes,
  isOffRoute,
  onEnd,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!currentStep) return null;

  const { type, modifier, instruction } = currentStep.maneuver;

  return (
    <div className="absolute left-0 right-0 z-[1002] top-14">
      {/* Banner header — tappable */}
      <div
        data-testid="nav-banner-header"
        onClick={() => !isOffRoute && setIsExpanded(e => !e)}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        style={{ background: 'linear-gradient(135deg,#162d4d,#0f2035)', borderBottom: '1px solid #00d4ff22' }}
      >
        {isOffRoute ? (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-amber-400">Re-routing…</span>
          </div>
        ) : (
          <>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#00d4ff18', border: '1.5px solid #00d4ff44' }}>
              <ManeuverIcon type={type} modifier={modifier} color="#00d4ff" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              {currentLanes && <LaneGuidance lanes={currentLanes} />}
              <div className="text-sm font-bold text-white truncate">{instruction}</div>
              <div className="text-xs text-[#00d4ff]">{formatDistance(distanceToManeuver)}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold text-[#00ff88]">{formatDuration(remainingDuration)}</div>
              <div className="text-xs text-slate-500">{formatDistance(remainingDistance)}</div>
            </div>
            <svg
              className="w-3 h-3 text-slate-500 flex-shrink-0 transition-transform"
              style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </div>

      {/* Expanded step list */}
      {isExpanded && !isOffRoute && (
        <div className="overflow-y-auto max-h-[40vh]" style={{ background: '#0d1f35' }}>
          {steps.map((step, idx) => {
            const isCurrent = step === currentStep;
            const hasFlood = stepsWithFloodWarning.has(idx);
            const stepType = step.maneuver.type;
            const stepMod = step.maneuver.modifier;
            const iconColor = isCurrent ? '#00d4ff' : '#64748b';

            return (
              <div
                key={`${step.maneuver.type}-${step.maneuver.modifier ?? ''}-${idx}`}
                className="flex items-center gap-3 px-3 py-2"
                style={{
                  borderTop: idx > 0 ? '1px solid #1e3a5f22' : 'none',
                  borderLeft: isCurrent ? '2px solid #00d4ff' : '2px solid transparent',
                  background: isCurrent ? '#00d4ff0a' : 'transparent',
                }}
              >
                <div
                  className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: isCurrent ? '#00d4ff18' : '#1e3a5f' }}
                >
                  <ManeuverIcon type={stepType} modifier={stepMod} color={iconColor} size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isCurrent ? 'font-semibold text-white' : 'text-slate-400'}`}>
                    {step.maneuver.instruction}
                  </div>
                  {hasFlood ? (
                    <div className="text-[10px] text-amber-400 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Flood zone nearby
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500">
                      {isCurrent ? formatDistance(distanceToManeuver) : formatDistance(step.distance)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer strip */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: '#0d1f35', borderTop: '1px solid #1e3a5f' }}
      >
        <span className="text-[10px] text-slate-500">
          To <span className="text-slate-400">{destination}</span>
        </span>
        <button
          onClick={() => onEnd?.()}
          aria-label="End navigation"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 active:scale-95 transition-colors duration-150 min-h-[36px]"
          style={{ background: '#ff444422', border: '1px solid #ff444444' }}
        >
          End
        </button>
      </div>
    </div>
  );
}
