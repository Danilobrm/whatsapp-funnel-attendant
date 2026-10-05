import { useCallback, useEffect, useRef, useState } from 'react';

const FLASH_MS = 1000;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Dois bipes curtos, gerados na hora — sem arquivo de áudio para carregar. */
function beep(ctx: AudioContext): void {
  for (const offset of [0, 0.25]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + offset + 0.18,
    );
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.2);
  }
}

/**
 * Alerta de pedido novo: bipe + título da aba piscando.
 *
 * O navegador bloqueia áudio até o primeiro gesto do usuário na página —
 * por isso o som só liga via `enableSound()` (o botão "Ativar som"). O título
 * pisca só se a aba não estiver em foco, e para quando o dono volta pra ela.
 */
export function useNewOrderAlert(flashText: (count: number) => string) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const unseenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const baseTitleRef = useRef(document.title);
  const flashTextRef = useRef(flashText);
  flashTextRef.current = flashText;

  const stopFlash = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      document.title = baseTitleRef.current;
    }
    unseenRef.current = 0;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) stopFlash();
    };
    window.addEventListener('focus', stopFlash);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', stopFlash);
      document.removeEventListener('visibilitychange', onVisible);
      stopFlash();
      void ctxRef.current?.close();
    };
  }, [stopFlash]);

  const enableSound = useCallback(() => {
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    ctxRef.current ??= new Ctor();
    void ctxRef.current.resume();
    setSoundEnabled(true);
  }, []);

  const notify = useCallback(() => {
    if (ctxRef.current) beep(ctxRef.current);

    if (!document.hidden && document.hasFocus()) return;
    unseenRef.current += 1;
    if (timerRef.current !== null) return;
    baseTitleRef.current = document.title;
    let on = false;
    timerRef.current = window.setInterval(() => {
      on = !on;
      document.title = on
        ? flashTextRef.current(unseenRef.current)
        : baseTitleRef.current;
    }, FLASH_MS);
  }, []);

  return { soundEnabled, enableSound, notify };
}
