function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 0.85;

  const voices = speechSynthesis.getVoices();
  const zh = voices.find(v => v.lang.startsWith("zh"));
  if (zh) u.voice = zh;

  speechSynthesis.speak(u);
}
