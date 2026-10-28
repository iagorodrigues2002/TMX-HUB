'use client';

import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';

function useEffectsState() {
  const [visual, setVisual] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [ambient, setAmbient] = useState(true);
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(100);
  const [testRequest, setTestRequest] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const audioBuffer = useRef<AudioBuffer | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const soundRequested = useRef(false);
  const soundRevision = useRef(0);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (gain.current && audio.current) {
      gain.current.gain.setTargetAtTime(volume / 100, audio.current.currentTime, 0.015);
    }
  }, [volume]);
  const toggleSound = async () => {
    const revision = ++soundRevision.current;
    soundRequested.current = !soundRequested.current;
    if (!soundRequested.current) {
      setSound(false);
      const source = playing.current;
      playing.current = null;
      if (source) {
        source.stop();
        source.disconnect();
      }
      return;
    }
    try {
      audio.current ??= new AudioContext();
      if (!gain.current) {
        gain.current = audio.current.createGain();
        gain.current.gain.value = volume / 100;
        gain.current.connect(audio.current.destination);
      }
      await audio.current.resume();
      if (!audioBuffer.current) {
        const response = await fetch('/signal-preview/sale-approved.mp3');
        if (!response.ok) throw new Error('Som indisponível');
        audioBuffer.current = await audio.current.decodeAudioData(await response.arrayBuffer());
      }
      if (revision !== soundRevision.current) return;
      soundRequested.current = audio.current.state === 'running';
      setSound(soundRequested.current);
    } catch {
      if (revision === soundRevision.current) {
        soundRequested.current = false;
        setSound(false);
      }
    }
  };
  const testNotification = () => {
    setTestRequest((value) => value + 1);
  };
  return {
    visual,
    setVisual,
    alerts,
    setAlerts,
    ambient,
    setAmbient,
    sound,
    volume,
    setVolume,
    gain,
    audio,
    audioBuffer,
    playing,
    toggleSound,
    testRequest,
    testNotification,
  };
}
const EffectsContext = createContext<ReturnType<typeof useEffectsState> | null>(null);
export function InterfaceEffectsProvider({ children }: { children: ReactNode }) {
  const value = useEffectsState();
  return <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>;
}
export function useInterfaceEffects() {
  const value = useContext(EffectsContext);
  if (!value) throw new Error('InterfaceEffectsProvider required');
  return value;
}
