export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  if (!sigunguCd || !bjdongCd || !bun) {
    return res.status(400).json({ error: '필수 파라미터 없음' });
  }

  const KEY = process.env.PUBLIC_DATA_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API 키 없음' });

  const jiVal = ji || '0000';
  const base = `https://apis.data.go.kr/1613000/BldRgstHubService`;
  const common = `?serviceKey=${KEY}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=0&bun=${bun}&ji=${jiVal}&numOfRows=1&pageNo=1&_type=json`;

  // 건축HUB API 엔드포인트 우선순위:
  // 1) 표제부 (건물 1동 기준, 가장 풍부한 정보)
  // 2) 총괄표제부 (단지/필지 기준)
  // 3) 기본개요 (가장 기본)
  const endpoints = [
    `${base}/getBrTitleInfo${common}`,
    `${base}/getBrRecapTitleInfo${common}`,
    `${base}/getBrBasisOulnInfo${common}`,
  ];

  const ELEV_KEY = process.env.ELEVATOR_API_KEY;

  let buildingData = null;
  let lastRawResponse = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      lastRawResponse = text;

      // XML 에러 응답 감지 (공공API는 JSON 요청해도 에러는 XML로 오는 경우 있음)
      if (text.trim().startsWith('<')) continue;

      const data = JSON.parse(text);
      const resultCode = data?.response?.header?.resultCode;
      if (resultCode && resultCode !== '00') continue;

      const items = data?.response?.body?.items?.item;
      if (!items) continue;
      if (Array.isArray(items) && items.length === 0) continue;

      buildingData = Array.isArray(items) ? items[0] : items;
      break;
    } catch (e) {
      continue;
    }
  }

  if (!buildingData) {
    const preview = lastRawResponse ? lastRawResponse.slice(0, 300) : 'no response';
    return res.status(404).json({
      error: '데이터 없음',
      debug: { sigunguCd, bjdongCd, bun, ji: jiVal, preview }
    });
  }

  // 승강기 데이터 (선택적)
  let elevData = null;
  if (ELEV_KEY && buildingData.platPlc) {
    try {
      const elevUrl = `https://apis.data.go.kr/1611000/ElevatorService/getElevatorList`
        + `?serviceKey=${ELEV_KEY}&address=${encodeURIComponent(buildingData.platPlc)}&numOfRows=10&pageNo=1&_type=json`;
      const elevRes = await fetch(elevUrl);
      const elevJson = await elevRes.json();
      const elevItems = elevJson?.response?.body?.items?.item;
      if (elevItems) elevData = Array.isArray(elevItems) ? elevItems : [elevItems];
    } catch (_) {}
  }

  return res.status(200).json({ data: buildingData, elevator: elevData });
}
