import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  if (!sigunguCd || !bjdongCd || !bun) {
    return res.status(400).json({ error: '필수 파라미터가 없습니다.' });
  }

  const KEY = process.env.PUBLIC_DATA_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: '서버 설정 오류: API 키 없음' });
  }

  const params = new URLSearchParams({
    serviceKey: KEY,
    sigunguCd: sigunguCd,
    bjdongCd: bjdongCd,
    platGbCd: '0',
    bun: bun,
    ji: ji || '0000',
    numOfRows: '1',
    pageNo: '1',
    _type: 'json'
  });

  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params.toString()}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(apiUrl, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('JSON 파싱 오류: ' + body.slice(0, 200)));
          }
        });
      }).on('error', reject);
    });

    const items = data?.response?.body?.items?.item;

    if (!items) {
      return res.status(404).json({ 
        error: '데이터를 찾을 수 없습니다.',
        debug: JSON.stringify(data?.response?.body).slice(0, 200)
      });
    }

    const item = Array.isArray(items) ? items[0] : items;
    return res.status(200).json({ data: item });

  } catch (e) {
    return res.status(500).json({ error: 'API 호출 실패: ' + e.message });
  }
}
