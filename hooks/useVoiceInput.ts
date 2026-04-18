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

export function useVoiceInput({
  onTranscript,
  onError,
  lang = "en-US",
}: UseVoiceInputOpts) {
  const [isSupported, setIsSupported] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalReceivedRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    setIsSupported(true);
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      finalReceivedRef.current = false;
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
        finalReceivedRef.current = true;
        setState("processing");
        setInterimTranscript("");
        onTranscriptRef.current(final);
        setState("idle");
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      setState("error");
      setInterimTranscript("");
      onErrorRef.current?.(event.error);
      window.setTimeout(() => setState("idle"), 1500);
    };

    recognition.onend = () => {
      if (!finalReceivedRef.current) {
        setInterimTranscript("");
        setState((prev) => (prev === "error" ? prev : "idle"));
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        // ignore — abort can throw if already stopped
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      // start() throws if already started — safe to ignore
    }
  }, []);

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
