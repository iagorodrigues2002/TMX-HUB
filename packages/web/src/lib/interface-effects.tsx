'use client';

import React, {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

function useEffectsState() {
  const [visual, setVisual] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [ambient, setAmbient] = useState(true);
  const [sound, setSound] = useState(true);
  const [soundPending, setSoundPending] = useState(true);
  const [soundError, setSoundError] = useState('');
  const [volume, setVolume] = useState(30);
  const [testRequest, setTestRequest] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const audioBuffer = useRef<AudioBuffer | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const soundRequested = useRef(true);
  const soundRevision = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const loadingBuffer = useRef<Promise<AudioBuffer> | null>(null);
  const activateSound = useCallback(async () => {
    if (!soundRequested.current) return;
    const revision = soundRevision.current;
    let context: AudioContext | null = null;
    try {
      if (!audio.current || audio.current.state === 'closed') {
        audio.current = new AudioContext();
        gain.current = null;
      }
      context = audio.current;
      if (!gain.current) {
        gain.current = context.createGain();
        gain.current.gain.value = volumeRef.current / 100;
        gain.current.connect(context.destination);
      }
      setSoundPending(context.state !== 'running');
      // Resume synchronously from a gesture; preload independently if autoplay is blocked.
      const resumed = context.resume();
      if (!audioBuffer.current && !loadingBuffer.current) {
        loadingBuffer.current = (async () => {
          const response = await fetch('/signal-preview/sale-approved.mp3');
          if (!response.ok) throw new Error('Som indisponível');
          return context!.decodeAudioData(await response.arrayBuffer());
        })();
      }
      const bufferPromise = loadingBuffer.current;
      const [, buffer] = await Promise.all([resumed, bufferPromise]);
      if (revision !== soundRevision.current || !soundRequested.current) return;
      if (buffer) audioBuffer.current = buffer;
      if (loadingBuffer.current === bufferPromise) loadingBuffer.current = null;
      setSoundPending(context.state !== 'running');
      setSoundError('');
    } catch {
      if (revision !== soundRevision.current || !soundRequested.current) return;
      loadingBuffer.current = null;
      setSoundPending(true);
      if (context?.state !== 'suspended')
        setSoundError('Não foi possível carregar o áudio. Tente desligar e ligar o som novamente.');
    }
  }, []);
  useEffect(() => {
    void activateSound();
    const unlock = () => {
      void activateSound();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      soundRevision.current++;
      loadingBuffer.current = null;
      if (audio.current && audio.current.state !== 'closed')
        void audio.current.close().catch(() => {});
    };
  }, [activateSound]);
  useEffect(() => {
    if (gain.current && audio.current) {
      gain.current.gain.setTargetAtTime(volume / 100, audio.current.currentTime, 0.015);
    }
  }, [volume]);
  const toggleSound = async () => {
    setSoundError('');
    ++soundRevision.current;
    soundRequested.current = !soundRequested.current;
    setSound(soundRequested.current);
    if (!soundRequested.current) {
      const source = playing.current;
      playing.current = null;
      if (source) {
        source.stop();
        source.disconnect();
      }
      return;
    }
    await activateSound();
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
    soundPending,
    soundError,
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
