require "json"
require "httparty"
require "dotenv/load"

API_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4.1"
DATA_FILE = "data/hsk1.json"

def generate_for_chatgpt(char_data)
  prompt = <<~PROMPT
    Ты помогаешь мне создать персональную систему изучения китайских SIMPLIFIED иероглифов.

    Для иероглифа: #{char_data["hanzi"]}
    Пиньинь: #{char_data["pinyin"]}

    В ответе сгенерируй СТРОГО JSON со следующими ключами:

    ru_translations:
    - массив из 1–2 кратких переводов на русском
    - если возможно — один перевод
    - не дублируй синонимы

    chatgpt_description_paragraph_1:
    - общее понятное объяснение иероглифа
    - что он означает в современном языке

    chatgpt_description_paragraph_2:
    - разбор структуры иероглифа
    - если иероглиф составной — объясни каждый компонент
    - если есть радикал — упомяни его роль

    chatgpt_description_paragraph_3:
    - как и где иероглиф обычно используется
    - устойчивые контексты, оттенки значения

    chatgpt_description_paragraph_4:
    - краткий культурный или философский аспект
    - ТОЛЬКО если он реально уместен
    - без эзотерики и надуманных обобщений

    Ограничения:
    - Пиши так, чтобы текст добавлял новое понимание, а не повторял очевидное значение слова.
    - Избегай популярных «разборов по частям», если они не дают реального понимания значения.
    - избегай очевидностей, делай более плотнее по информации и полезности
    - каждый параграф — 2–4 предложений
    - никакого булшита, абстрактной эзотерики и надуманных историй
    - если информации недостаточно — пиши просто и честно
    - когда пишешь иероглиф ВСЕГДА рядом добавляй пиньинь

    Никакого текста вне JSON.
    Без Markdown.
    Без вступлений.
  PROMPT

  response = HTTParty.post(
    API_URL,
    headers: {
      "Authorization" => "Bearer #{ENV['OPENAI_API_KEY']}",
      "Content-Type" => "application/json"
    },
    body: {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    }.to_json
  )

  content = response.dig("choices", 0, "message", "content")
  JSON.parse(content)
end

data = JSON.parse(File.read(DATA_FILE))

data.each_with_index do |char_data, i|
  hanzi = char_data["hanzi"] || char_data["char"]

  puts "→ #{hanzi} (#{i + 1}/#{data.size})"

  # если философия уже есть — считаем, что объект обработан
  if char_data.key?("chatgpt_description_paragraph_1") && !char_data["chatgpt_description_paragraph_1"].to_s.strip.empty?
    puts "  пропуск — уже есть chatgpt_description_paragraph_1"
    next
  end

  begin
    result = generate_for_chatgpt(char_data)

    # аккуратно вмерживаем новые поля
    char_data.merge!(result)

    # сразу сохраняем файл (идемпотентность)
    File.write(
      DATA_FILE,
      JSON.pretty_generate(data, ensure_ascii: false)
    )

    sleep 1.5
  rescue => e
    puts "  ошибка: #{e.class}: #{e.message}"
    puts "  stack trace:"
    e.backtrace.each { |line| puts "    #{line}" }
    break
  end
end
