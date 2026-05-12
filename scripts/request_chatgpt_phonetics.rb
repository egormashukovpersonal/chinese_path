require "json"
require "httparty"
require "dotenv/load"

API_URL   = "https://api.openai.com/v1/chat/completions"
MODEL     = "gpt-4.1"
DATA_FILE = "data/phonetics_db.json"

PHONETICS = [
  "羊",
  "青",
  "马",
  "包",
  "方",
  "令",
  "良",
  "交",
  "可",
  "工",
  "反",
  "皮",
  "昔",
  "舌",
  "寺",
  "肖",
  "票",
  "乔",
  "仓",
  "同",
  "生",
  "成",
  "占",
  "亡",
  "分",
  "及",
  "每",
  "曼",
  "羊",
  "兆",
  "尧",
  "苗",
  "肖",
  "召",
  "采",
  "果",
  "甫",
  "付",
  "台",
  "古",
  "央",
  "平",
  "半",
  "本",
  "民",
  "申",
  "白",
  "句",
  "龙",
  "牙",
  "巴",
  "仓",
  "合",
  "奇",
  "居",
  "京",
  "单",
  "少",
  "长",
  "主",
  "元",
  "化",
  "才",
  "仓",
  "仓",
  "旦",
  "当",
  "弟",
  "者",
  "直",
  "周",
  "朱",
  "余",
  "永",
  "舌",
  "安",
  "官",
  "音",
  "章",
  "星",
  "真",
  "争",
  "巨",
  "监",
  "建",
  "兼",
  "见",
  "戋",
  "柬",
  "今",
  "井",
  "竟",
  "九",
  "句",
  "卡",
  "开",
  "克",
  "空",
  "来",
  "乐",
  "离",
  "里",
  "立",
  "列",
  "林",
  "龙",
  "录",
  "卯",
  "毛",
  "门",
  "蒙",
  "米",
  "免",
  "明",
  "莫",
  "某",
  "南",
  "内",
  "念",
  "农",
  "旁",
  "朋",
  "其",
  "奇",
  "齐",
  "乞",
  "千",
  "乔",
  "亲",
  "青",
  "丘",
  "区",
  "全",
  "犬",
  "然",
  "壬",
  "忍",
  "容",
  "少",
  "舍",
  "申",
  "升",
  "失",
  "氏",
  "世",
  "守",
  "束",
  "曷",
  "唐",
  "它",
  "太",
  "汤",
  "亭",
  "同",
  "土",
  "屯",
  "瓦",
  "韦",
  "未",
  "文",
  "我",
  "吴",
  "五",
  "西",
  "先",
  "相",
  "象",
  "肖",
  "孝",
  "些",
  "辛",
  "行",
  "凶",
  "兄",
  "秀",
  "玄",
  "央",
  "夭",
  "尹",
  "由",
  "酉",
  "于",
  "予",
  "员",
  "爰",
  "月",
  "云",
  "早",
  "乍",
  "占",
  "长",
  "召",
  "真",
  "争",
  "只",
  "至",
  "中",
  "重",
  "舟",
  "朱",
  "专",
  "卓",
  "宗",
  "足"
]

def generate_for_chatgpt(phonetic)
  prompt = <<~PROMPT
    Ты помогаешь создавать систему изучения китайских ФОНЕТИКОВ.

    Для фонетика:

    #{phonetic}

    Верни STRICT JSON.

    Формат:

    {
      "phonetic": "羊",
      "phonetic_pinyin": "yáng",

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
    - chars должны реально содержать этот фонетик
    - фонетик должен быть визуально очевиден
    - пиньинь должен быть похож на фонетик
    - только частые и полезные иероглифы
    - HSK1-5 в приоритете
    - максимум 25 chars
    - только ОДИН иероглиф в hanzi
    - chars должны образовывать ФОНЕТИЧЕСКУЮ семью
    - чтение должно быть исторически или современно связано
    - минимум 4 chars если возможно
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

  content =
    response.dig(
      "choices",
      0,
      "message",
      "content"
    )

  raise "Empty OpenAI response" if content.nil?

  JSON.parse(content)
end

data =
  if File.exist?(DATA_FILE)
    JSON.parse(File.read(DATA_FILE))
  else
    []
  end

PHONETICS.each_with_index do |phonetic, i|
  puts "→ #{phonetic} (#{i + 1}/#{PHONETICS.size})"

  existing = data.find do |item|
    item["phonetic"] == phonetic
  end

  if existing
    puts "  skip"
    next
  end

  begin
    result =
      generate_for_chatgpt(phonetic)

    if result["chars"].is_a?(Array)
      result["chars"] =
        result["chars"].uniq do |char|
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
    puts "JSON error: #{e.message}"
    break

  rescue StandardError => e
    puts "error: #{e.class}: #{e.message}"
    break
  end
end
