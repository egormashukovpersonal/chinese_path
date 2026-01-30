require "json"
require "httparty"
require "dotenv/load"

API_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4.1"
DATA_FILE = "data/hsk2.json"

def generate_for_chatgpt(char_data)
  prompt = <<~PROMPT

    учу китайский, дай пример простого/популярного употребления в жизни #{char_data["hanzi"]} pinyin которого #{char_data["pinyin"]} в json с ключами:

    example_hanzi - пример использования
    example_pinying - тот же пример в pinying
    example_ru - тот же пример по русски

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
  if char_data.key?("example_hanzi") && !char_data["example_hanzi"].to_s.strip.empty?
    puts "  пропуск — уже есть example_hanzi"
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
