export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  if (!sigunguCd || !bjdongCd || !bun) {
    return res.status(400).json({ error: '필수 파라미터가 없습니다.' });
  }

  const KEY = process.env.PUBLIC_DATA_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: '서버 설정 오류' });
  }

  try {
    const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo`
      + `?serviceKey=${encodeURIComponent(KEY)}`
      + `&sigunguCd=${sigunguCd}`
      + `&bjdongCd=${bjdongCd}`
      + `&platGbCd=0`
      + `&bun=${bun}`
      + `&ji=${ji || '0000'}`
      + `&numOfRows=1&pageNo=1&_type=json`;

    const response = await fetch(url);
    const data = await response.json();
    const items = data?.response?.body?.items?.item;

    if (!items) {
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
    }

    const item = Array.isArray(items) ? items[0] : items;
    return res.status(200).json({ data: item });

  } catch (e) {
    return res.status(500).json({ error: 'API 호출 실패' });
  }
}
