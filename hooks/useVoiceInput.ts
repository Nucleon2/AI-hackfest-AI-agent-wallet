"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "processing" | "error";

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string; confidence: number };
    isFinal: boolean;
    length: number;
  }>;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

interface UseVoiceInputOpts {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceInput({
  onTranscript,
  onError,
  lang = "en-US",
}: UseVoiceInputOpts) {
  const [isSupported, setIsSupported] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  useEffect(() => {
    setIsSupported(!!getCtor());
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current !== null) {
        window.clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  }, [lang]);

  const ensureRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
      return recognitionRef.current;
    }
    const Ctor = getCtor();
    if (!Ctor) return null;

    let recognition: SpeechRecognitionInstance;
    try {
      recognition = new Ctor();
    } catch {
      return null;
    }

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setInterimTranscript("");
      setState("listening");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) final += text;
        else interim += text;
      }

      if (final) {
        setState("processing");
        setInterimTranscript("");
        onTranscriptRef.current(final);
        // onend will flip us back to idle on the next tick so the
        // processing state actually gets a render pass.
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      setState("error");
      setInterimTranscript("");
      onErrorRef.current?.(event.error);
      if (errorTimeoutRef.current !== null) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        errorTimeoutRef.current = null;
        setState("idle");
      }, 1500);
    };

    recognition.onend = () => {
      setInterimTranscript("");
      setState((prev) => (prev === "error" ? prev : "idle"));
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [lang]);

  const start = useCallback(() => {
    const recognition = ensureRecognition();
    if (!recognition) return;
    if (errorTimeoutRef.current !== null) {
      window.clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    try {
      recognition.start();
    } catch {
      // already started — safe to ignore
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "listening") stop();
    else if (state === "idle") start();
  }, [state, start, stop]);

  return {
    isSupported,
    state,
    interimTranscript,
    start,
    stop,
    toggle,
  };
}
