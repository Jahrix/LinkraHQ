const SOUND_PATHS = {
  startup: "/sounds/startup.wav",
  morning: "/sounds/morning.wav",
  evening: "/sounds/evening.wav",
  night: "/sounds/night.wav",
  commit: "/sounds/commit.wav",
  endofday: "/sounds/endofday.wav"
} as const;

export type SoundName = keyof typeof SOUND_PATHS;

const audioCache = new Map<SoundName, HTMLAudioElement>();

function getAudio(name: SoundName) {
  const cached = audioCache.get(name);
  if (cached) {
    return cached;
  }

  const audio = new Audio(SOUND_PATHS[name]);
  audio.preload = "auto";
  audioCache.set(name, audio);
  return audio;
}

function playSound(name: SoundName) {
  if (typeof window === "undefined") {
    return;
  }

  const audio = getAudio(name);
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Ignore autoplay / decode failures. Sounds are enhancement-only.
  });
}

function sessionPlayed(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSessionPlayed(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Ignore storage failures.
  }
}

function currentGreetingSound(date = new Date()): SoundName {
  const hour = date.getHours();
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 || hour < 5) return "night";
  return "morning";
}

export function playStartupSoundOnce(scope = "default") {
  const key = `linkra-sound:startup:${scope}`;
  if (sessionPlayed(key)) {
    return;
  }
  markSessionPlayed(key);
  playSound("startup");
}

export function playGreetingSoundOnce(date = new Date()) {
  const sound = currentGreetingSound(date);
  const day = date.toISOString().slice(0, 10);
  const key = `linkra-sound:greeting:${day}:${sound}`;
  if (sessionPlayed(key)) {
    return;
  }
  markSessionPlayed(key);
  playSound(sound);
}

export function playCommitSound() {
  playSound("commit");
}

export function playEndOfDaySound() {
  playSound("endofday");
}
