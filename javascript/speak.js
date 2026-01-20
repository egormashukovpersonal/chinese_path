function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 0.85;

  const voices = speechSynthesis.getVoices();
  const zh = voices.find(v => v.lang.startsWith("zh"));
  if (zh) u.voice = zh;

  speechSynthesis.speak(u);
}


function speak2(text) {
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
