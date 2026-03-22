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
    const response = await fetch(apiUrl);
    const data = await response.json();

    const items = data?.response?.body?.items?.item;
    if (!items || (Array.isArray(items) && items.length === 0)) {
      return res.status(404).json({ error: '데이터 없음' });
    }

    return res.status(200).json({ data: Array.isArray(items) ? items[0] : items });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
