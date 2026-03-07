let SPEAK_MUTED = localStorage.getItem("speakMuted") === "true";

function speak(text) {
  if (SPEAK_MUTED) return;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 0.9;
  u.pitch = 1.0;

  const pickVoice = () => {
    const voices = speechSynthesis.getVoices();
    const preferred =
      voices.find(v => v.lang === "zh-CN" && v.name.includes("Ting")) ||
      voices.find(v => v.lang.startsWith("zh"));

    if (preferred) u.voice = preferred;
    speechSynthesis.speak(u);
  };

  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = pickVoice;
  } else {
    pickVoice();
  }
}

function toggleSpeakMute() {
  SPEAK_MUTED = !SPEAK_MUTED;

  localStorage.setItem("speakMuted", SPEAK_MUTED);

  const btn = document.getElementById("speak-mute-btn");
  if (!btn) return;

  btn.textContent = SPEAK_MUTED ? "🔇" : "🔊";
}
