import React, { useState, useEffect, useRef } from 'react';
import type { Raid } from '../data/raids';

export interface RevealAnimationProps {
  eligibleRaids: Raid[];
  pickedRaid: Raid | null;
  pickedPercentage?: string;
  pickedVotes?: number;
  onComplete: () => void;
}

// Synthesize tactical Destiny-style sci-fi sound effects using Web Audio API
function playSound(type: 'tick' | 'lock' | 'slam') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'tick') {
      // Rapid high-tech telemetry blip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'lock') {
      // Crisp confirmation chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'slam') {
      // Deep sub-bass tactical impact slam
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.65);

      // White-noise burst for mechanical resonance
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    }
  } catch {
    // If audio is blocked or unsupported, fail silently
  }
}

export const RevealAnimation: React.FC<RevealAnimationProps> = ({
  eligibleRaids,
  pickedRaid,
  pickedPercentage,
  pickedVotes,
  onComplete,
}) => {
  // Phases: 'decryption' (cycling) -> 'locking' (flash/lock) -> 'revealed' (slam hero)
  const [phase, setPhase] = useState<'decryption' | 'locking' | 'revealed'>('decryption');
  const [displayRaidIndex, setDisplayRaidIndex] = useState(0);
  const cycleCountRef = useRef(0);

  const candidatePool = eligibleRaids.length > 0 ? eligibleRaids : (pickedRaid ? [pickedRaid] : []);

  // 1. Decryption Phase: Rapid slot-machine cycling with deceleration physics
  useEffect(() => {
    if (phase !== 'decryption') return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let currentInterval = 60; // start fast (60ms)
    const maxCycles = 26; // total cycles before locking

    const targetIndex = pickedRaid
      ? candidatePool.findIndex((r) => r.id.toLowerCase() === pickedRaid.id.toLowerCase())
      : 0;
    const finalTargetIndex = targetIndex >= 0 ? targetIndex : 0;

    const step = () => {
      cycleCountRef.current += 1;

      if (cycleCountRef.current >= maxCycles) {
        // Lock onto the exact target destination!
        setDisplayRaidIndex(finalTargetIndex);
        setPhase('locking');
        playSound('lock');
        setTimeout(() => {
          setPhase('revealed');
          playSound('slam');
        }, 500);
      } else {
        setDisplayRaidIndex((prev) => (prev + 1) % candidatePool.length);
        playSound('tick');

        // Smoothly decelerate as it approaches the pick
        if (cycleCountRef.current > 16) {
          currentInterval += 25;
        } else if (cycleCountRef.current > 10) {
          currentInterval += 12;
        }
        timeoutId = setTimeout(step, currentInterval);
      }
    };

    timeoutId = setTimeout(step, currentInterval);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [phase, candidatePool, pickedRaid]);

  // Active raid to display: during 'locking' and 'revealed', always display the picked raid
  const currentCyclingRaid = (phase === 'revealed' || phase === 'locking') && pickedRaid
    ? pickedRaid
    : candidatePool[displayRaidIndex] || pickedRaid;

  return (
    <div className="reveal-overlay-backdrop">
      {/* Background Reticle & HUD Lines */}
      <div className="reveal-hud-reticle">
        <div className="hud-corner hud-corner-tl" />
        <div className="hud-corner hud-corner-tr" />
        <div className="hud-corner hud-corner-bl" />
        <div className="hud-corner hud-corner-br" />
      </div>

      {/* Top Status Header */}
      <div className="reveal-overlay-header">
        <div className="reveal-header-protocol">
          <span className="reveal-status-indicator" />
          <span className="label-caps gold-label">
            {phase === 'decryption' && 'Tallying Fireteam Ballots'}
            {phase === 'locking' && 'Locking Destination'}
            {phase === 'revealed' && 'Destination Selected'}
          </span>
        </div>

        <button
          type="button"
          className="btn btn-sm reveal-skip-btn"
          onClick={onComplete}
          title="Skip animation and proceed to fireteam standings"
        >
          SKIP
        </button>
      </div>

      {/* Center Cinematic Card */}
      <div className="reveal-cinematic-stage">
        {phase === 'decryption' || phase === 'locking' ? (
          <div
            className={`reveal-reel-card ${phase === 'locking' ? 'is-locking' : ''}`}
            style={{
              backgroundImage: currentCyclingRaid?.image
                ? `linear-gradient(rgba(8,12,18,0.82), rgba(8,12,18,0.88)), url(${currentCyclingRaid.image})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              transition: 'background-image 0.12s ease',
            }}
          >
            <div className="label-caps gold-label" style={{ marginBottom: '8px' }}>
              {phase === 'locking' ? 'Destination Locked' : 'Tallying Highest Votes...'}
            </div>

            <div className="reel-raid-title">
              {currentCyclingRaid?.name || "Analyzing Target..."}
            </div>

            <div className="reel-raid-location">
              {currentCyclingRaid?.location || "Destination"}
            </div>

            <div className="reveal-progress-track">
              <div
                className="reveal-progress-fill"
                style={{ width: `${Math.min(100, (cycleCountRef.current / 26) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          /* Signature Hero Impact Slam Card */
          <div
            className="reveal-hero-slam-card"
            style={{
              backgroundImage: `linear-gradient(rgba(10, 14, 20, 0.90), rgba(10, 14, 20, 0.92)), url(${pickedRaid?.image || '/raids/placeholder.svg'})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="hero-slam-badge">
              <span className="slam-pill-gold">Selected Destination</span>
              <span className="slam-pill-odds">
                {pickedVotes !== undefined
                  ? `${pickedVotes} ${pickedVotes === 1 ? 'Vote' : 'Votes'}`
                  : pickedPercentage
                  ? `${pickedPercentage}% Consensus`
                  : 'Highest Vote'}
              </span>
            </div>

            <h1 className="hero-slam-title">
              {pickedRaid?.name || 'Selected Destination'}
            </h1>

            <div className="hero-slam-location">
              {pickedRaid?.location && (
                <span style={{ color: 'var(--meta-cyan)', fontWeight: 600 }}>
                  {pickedRaid.location}
                </span>
              )}
              {pickedRaid?.location && pickedRaid?.tagline && (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}> · </span>
              )}
              {pickedRaid?.tagline}
            </div>

            <div className="hero-slam-actions">
              <button
                type="button"
                className="btn btn-primary btn-large hero-slam-proceed-btn"
                onClick={onComplete}
              >
                VIEW STANDINGS &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Telemetry Ticker */}
      <div className="reveal-footer-telemetry">
        <span className="label-caps">Fireteam Ballot</span>
        <span className="label-caps gold-label">Highest Vote Win</span>
      </div>
    </div>
  );
};

export default RevealAnimation;
