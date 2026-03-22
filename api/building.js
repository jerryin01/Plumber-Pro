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
  const base = 'https://apis.data.go.kr/1613000/BldRgstHubService';
  const common = `?serviceKey=${KEY}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=0&bun=${bun}&ji=${jiVal}&numOfRows=1&pageNo=1&_type=json`;

  const endpoints = [
    base + '/getBrTitleInfo' + common,
    base + '/getBrRecapTitleInfo' + common,
    base + '/getBrBasisOulnInfo' + common,
  ];

  // ── 1. 건물 데이터 조회 ──────────────────────────────────────
  let buildingData = null;
  let lastPreview = '';

  for (const url of endpoints) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      lastPreview = text.slice(0, 300);
      if (text.trim().startsWith('<')) continue;
      const json = JSON.parse(text);
      if (json?.response?.header?.resultCode !== '00') continue;
      const item = json?.response?.body?.items?.item;
      if (!item || (Array.isArray(item) && item.length === 0)) continue;
      buildingData = Array.isArray(item) ? item[0] : item;
      break;
    } catch (_) { continue; }
  }

  if (!buildingData) {
    return res.status(404).json({ error: '데이터 없음', debug: { sigunguCd, bjdongCd, bun, ji: jiVal, preview: lastPreview } });
  }

  // ── 2. 승강기 데이터 조회 (실패해도 건물 데이터는 반환) ──────
  let elevData = null;
  const ELEV_KEY = process.env.ELEVATOR_API_KEY;

  if (ELEV_KEY) {
    try {
      const platPlc = buildingData.platPlc || '';
      const parts = platPlc.split(' ');

      const sidoMap = {
        '서울특별시':'서울','부산광역시':'부산','대구광역시':'대구','인천광역시':'인천',
        '광주광역시':'광주','대전광역시':'대전','울산광역시':'울산','세종특별자치시':'세종',
        '경기도':'경기','강원특별자치도':'강원','충청북도':'충북','충청남도':'충남',
        '전북특별자치도':'전북','전라남도':'전남','경상북도':'경북','경상남도':'경남','제주특별자치도':'제주'
      };

      const sido = sidoMap[parts[0]] || parts[0] || '';
      const sigungu = parts[1] || '';
      const dongName = parts[parts.length - 2] || '';
      const bunjiNum = parts[parts.length - 1] || '';

      // 승강기 목록 조회
      const listUrl = 'https://apis.data.go.kr/B553664/BuldElevatorService/getElevatorListM'
        + '?serviceKey=' + ELEV_KEY
        + '&sido=' + encodeURIComponent(sido)
        + '&sigungu=' + encodeURIComponent(sigungu)
        + '&pageNo=1&numOfRows=20';

      const listRes = await fetch(listUrl);
      const listText = await listRes.text();

      // XML 파싱
      const parseXmlItems = (xml) => {
        const items = [];
        const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const block of matches) {
          const get = (tag) => { const m = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>')); return m ? m[1].trim() : ''; };
          items.push({
            elevator_no:    get('elevator_no'),
            elvtrDivNm:     get('elvtrDivNm'),
            elvtrSttsNm:    get('elvtrSttsNm'),
            installationDe: get('installationDe'),
            vldtyEndDe:     get('vldtyEndDe'),
            jdgmentNm:      get('jdgmentNm'),
            buldNm:         get('buldNm'),
            address1:       get('address1'),
          });
        }
        return items;
      };

      let elevList = [];
      if (listText.trim().startsWith('<')) {
        elevList = parseXmlItems(listText);
      } else {
        const listJson = JSON.parse(listText);
        const raw = listJson?.response?.body?.items?.item;
        if (raw) elevList = Array.isArray(raw) ? raw : [raw];
      }

      // raw 응답 앞부분 디버그용 저장
      const _rawPreview = listText.slice(0, 500);

      // 주소 필터링
      const filtered = elevList.filter(e => e.address1 && (e.address1.includes(dongName) || e.address1.includes(bunjiNum)));
      elevData = filtered.length > 0 ? filtered : elevList.slice(0, 5);
      if (elevData.length === 0) elevData = [{ _debug: '목록 없음', _raw: _rawPreview, sido, sigungu }];

      // 검사이력 조회 (첫 번째 승강기)
      if (elevData.length > 0 && elevData[0].elevator_no) {
        const inspUrl = 'https://apis.data.go.kr/B553664/BuldElevatorService/getElvtrInspctInqireM'
          + '?serviceKey=' + ELEV_KEY
          + '&elevator_no=' + elevData[0].elevator_no
          + '&pageNo=1&numOfRows=5';

        const inspRes = await fetch(inspUrl);
        const inspText = await inspRes.text();

        if (inspText.trim().startsWith('<')) {
          const inspItems = parseXmlItems(inspText);
          if (inspItems.length > 0) {
            elevData[0].inspHistory = inspItems.slice(0, 3).map(i => ({
              inspDe:      i.inspDe      || '',
              inspInsttNm: i.inspInsttNm || '',
              inspTypeNm:  i.inspTypeNm  || '',
              jdgmentNm:   i.jdgmentNm   || '',
            }));
          }
        }
      }

    } catch (e) {
      // 승강기 실패해도 건물 데이터는 정상 반환
      elevData = { _error: e.message };
    }
  }

  return res.status(200).json({ data: buildingData, elevator: elevData });
}

