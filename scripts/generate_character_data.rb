require "json"
require "httparty"
require "dotenv/load"

API_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4o-mini"

DATA_FILE = "data/hsk1.json"

def generate_for(char_data)
  prompt = <<~PROMPT
    Ты помогаешь мне создать персональную систему изучения китайских иероглифов.

    Для иероглифа: #{char_data["hanzi"]}
    Пиньинь: #{char_data["pinyin"]}

    В ответе сгенерируй СТРОГО JSON со следующими ключами:

    - ru_translations: массив из 1–2 кратких переводов на русском. Если можешь ограничится одним то лучше одним, не надо дубликаты делать
    - history: один связный параграф про происхождение иероглифа, его образ, или общий смысл формы
    - philosophy: один параграф про философский КАЙФ этого иероглифа — где здесь даосское мышление, образность, отличие от европейского рационального взгляда
    - homonyms: STRING - омонимы с переводом и пиньинь
    - usage_example: пример использования. слухо-телесное запоминание без булщита, внутреннее ухо языка, почему такой пиньинь. любая иснтересная инфа БЕЗ БУЛЩИТА И ТУПОЙ ОБРАЗНОСТИ

    Ограничения:
    - каждый параграф — не более 3–4 предложений
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
  if char_data.key?("philosophy") && !char_data["philosophy"].to_s.strip.empty?
    puts "  пропуск — уже есть philosophy"
    next
  end

  begin
    result = generate_for(char_data)

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
