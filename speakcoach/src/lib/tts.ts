"use client";

/**
 * Reads questions aloud with the browser's built-in speech synthesis. Kept behind this small
 * interface so a better TTS API can be swapped in later without touching the Q&A screen.
 */
export interface Speaker {
  available: boolean;
  speak(text: string): Promise<void>;
  cancel(): void;
}

// Preferred English voices, most natural first. Falls back to any English voice.
const PREFERRED = [/en-GB.*(Natural|Neural|Premium|Enhanced)/i, /en-IN/i, /en-GB/i, /en-AU/i, /en-US.*(Natural|Neural|Premium|Enhanced)/i, /^en/i];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(`${x.lang} ${x.name}`));
    if (v) return v;
  }
  return undefined;
}

export function browserSpeaker(): Speaker {
  const available = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    available,
    speak(text: string) {
      if (!available) return Promise.resolve();
      return new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? "en-GB";
        u.rate = 0.97;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        u.onend = finish;
        u.onerror = finish;
        // Some browsers never fire onend; don't block the user.
        window.setTimeout(finish, 2000 + text.length * 90);
        window.speechSynthesis.speak(u);
      });
    },
    cancel() {
      if (available) window.speechSynthesis.cancel();
    },
  };
}

/** Voices load asynchronously in Chrome; call early so the first question uses the right one. */
export function warmUpVoices() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
}
