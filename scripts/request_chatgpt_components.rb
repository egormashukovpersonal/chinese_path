require "json"
require "httparty"
require "dotenv/load"

API_URL  = "https://api.openai.com/v1/chat/completions"
MODEL    = "gpt-4.1"
DATA_FILE = "data/components_db.json"

COMPONENTS = [
  "口", "女", "人", "亻", "心", "忄", "木", "氵", "火", "灬",
  "土", "日", "月", "山", "石", "田", "禾", "米", "纟", "言",
  "讠", "贝", "车", "马", "鸟", "雨", "手", "扌", "足", "辶",
  "门", "耳", "目", "见", "页", "力", "刀", "刂", "弓", "子",
  "宀", "广", "厂", "彳", "攵", "夂", "犬", "犭", "牛", "牜",
  "竹", "⺮", "艹", "虫", "鱼", "酉", "金", "钅", "玉", "王",
  "示", "礻", "衣", "衤", "食", "饣", "青", "音", "立", "穴",
  "走", "身", "骨", "黑", "白", "赤", "牙", "齿", "鹿", "麻",
  "龙", "龟", "鼠", "舟", "羽", "羊", "美", "气", "水", "冰",
  "冫", "风", "飞", "首", "香", "瓜", "豆", "角", "辛", "寸"
]

def generate_for_chatgpt(component)
  prompt = <<~PROMPT
    Ты помогаешь создавать систему изучения китайских компонентов.

    Для компонента:

    #{component}

    Верни STRICT JSON.

    Формат:

    {
      "component": "女",
      "meaning_en": "...",
      "meaning_ru": "...",
      "meaning_pl": "...",
      "chars": [
        {
          "hanzi": "...",
          "pinyin": "...",
          "hsk": 1,
          "translation_ru": "...",
          "translation_en": "...",
          "translation_pl": "...",
          "example_hanzi": "...",
          "example_pinyin": "...",
          "example_pl": "..."
        }
      ]
    }

    Правила:
    - только популярные и полезные знаки
    - HSK1-4 в приоритете
    - HSK5+ только если знак очень частый
    - компонент должен быть ВИЗУАЛЬНО очевиден
    - не добавляй редкие или древние знаки
    - максимум 25 знаков
    - только ОДИН иероглиф в поле hanzi
    - никаких слов или фраз
    - примеры должны быть короткие и естественные
    - без markdown
    - без текста вне JSON
  PROMPT

  response = HTTParty.post(
    API_URL,
    headers: {
      "Authorization" => "Bearer #{ENV["OPENAI_API_KEY"]}",
      "Content-Type"  => "application/json"
    },
    body: {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: {
        type: "json_object"
      }
    }.to_json
  )

  unless response.success?
    raise "OpenAI API error: #{response.code} #{response.body}"
  end

  content = response.dig("choices", 0, "message", "content")

  raise "Empty OpenAI response" if content.nil? || content.strip.empty?

  JSON.parse(content)
end

data =
  if File.exist?(DATA_FILE)
    JSON.parse(File.read(DATA_FILE))
  else
    []
  end

COMPONENTS.each_with_index do |component, i|
  puts "→ #{component} (#{i + 1}/#{COMPONENTS.size})"

  existing = data.find do |item|
    item["component"] == component
  end

  if existing
    puts "  пропуск — уже существует"
    next
  end

  begin
    result = generate_for_chatgpt(component)

    # убираем дубликаты внутри chars
    if result["chars"].is_a?(Array)
      result["chars"] = result["chars"].uniq do |char|
        char["hanzi"]
      end
    end

    data << result

    File.write(
      DATA_FILE,
      JSON.pretty_generate(data)
    )
    sleep 3
  rescue JSON::ParserError => e
    puts "  ошибка JSON: #{e.message}"
    break
  rescue StandardError => e
    puts "  ошибка: #{e.class}: #{e.message}"

    e.backtrace.first(10).each do |line|
      puts "    #{line}"
    end

    break
  end
end
