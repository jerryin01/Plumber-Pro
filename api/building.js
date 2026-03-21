import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  if (!sigunguCd || !bjdongCd || !bun) {
    return res.status(400).json({ error: '필수 파라미터 없음' });
  }

  const KEY = process.env.PUBLIC_DATA_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API 키 없음' });

  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo`
    + `?serviceKey=${KEY}`
    + `&sigunguCd=${sigunguCd}`
    + `&bjdongCd=${bjdongCd}`
    + `&platGbCd=0`
    + `&bun=${bun}`
    + `&ji=${ji || '0000'}`
    + `&numOfRows=1&pageNo=1&_type=json`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(apiUrl, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('파싱오류:' + body.slice(0, 300))); }
        });
      }).on('error', reject);
    });

    const items = data?.response?.body?.items?.item;
    if (!items) {
      return res.status(404).json({
        error: '데이터 없음',
        debug: JSON.stringify(data?.response?.body || data).slice(0, 300)
      });
    }

    return res.status(200).json({ data: Array.isArray(items) ? items[0] : items });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
