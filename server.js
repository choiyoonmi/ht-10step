const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Claude API 호출 엔드포인트
app.post('/api/extract-pdf', async (req, res) => {
  try {
    const { filename, base64 } = req.body;
    const apiKey = process.env.CLAUDE_API_KEY;

    console.log(`[${new Date().toISOString()}] PDF 처리 시작: ${filename}`);
    console.log(`Base64 길이: ${base64?.length || 'undefined'}`);
    console.log(`API 키 설정: ${apiKey ? '있음' : '없음'}`);

    if (!apiKey) {
      console.error('❌ CLAUDE_API_KEY가 설정되지 않았습니다');
      return res.status(500).json({ error: '서버: CLAUDE_API_KEY 환경변수가 설정되지 않았습니다' });
    }

    const prompt = `다음은 영어 교재/시험지 PDF입니다. 영어 독해 지문을 추출하여 아래 JSON 형식으로만 반환하세요.

{
  "passages": [
    {
      "no": "지문 번호 또는 단원명 (예: Lesson 3, 18번)",
      "type": "지문 유형 (예: 글의 목적, 빈칸 추론)",
      "sentences": [
        {"e": "영어 원문 문장만 (한글 절대 포함 금지)", "k": "자연스러운 한국어 해석"},
        {"e": "영어 원문 문장 2", "k": "한국어 해석 2"}
      ]
    }
  ]
}

반드시 지켜야 할 규칙:
1. e 필드에는 순수한 영어 문장만 넣으세요. 한글, 교과서명, 단원명이 절대 포함되면 안 됩니다.
   잘못된 예: "22 개정 중 2 동아 윤정미 3과 1 Lesson 3 What a Great Idea!"
   올바른 예: "What a Great Idea!"
2. 교과서 단원명, 과목명, 저자명, 페이지 번호 등 메타데이터는 모두 제외하세요.
3. 선택지, 문제 지시문, 듣기 스크립트는 제외하세요.
4. 영어 원문은 절대 수정하지 마세요.
5. k 필드는 해당 영어 문장의 자연스러운 한국어 번역만 넣으세요.
6. JSON만 반환하고 코드블록이나 다른 설명은 넣지 마세요.`;

    console.log('Claude API 호출 중...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    console.log(`Claude API 응답: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Claude API Error:', response.status, errorData);
      return res.status(response.status).json({
        error: `Claude API 오류 ${response.status}: ${errorData}`
      });
    }

    const data = await response.json();
    console.log('✅ Claude API 처리 완료');
    const text = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.passages && parsed.passages.length > 0) {
      res.json({ passages: parsed.passages });
    } else {
      res.status(400).json({ error: '지문을 찾을 수 없습니다' });
    }
  } catch (err) {
    console.error('Server Error:', err.message);
    res.status(500).json({ error: `서버 에러: ${err.message}` });
  }
});

// 홈페이지 - index.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
