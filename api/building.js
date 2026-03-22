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

  const endpoints = [
    `${base}/getBrTitleInfo${common}`,
    `${base}/getBrRecapTitleInfo${common}`,
    `${base}/getBrBasisOulnInfo${common}`,
  ];

  let buildingData = null;
  let lastRawResponse = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      lastRawResponse = text;
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

  // ── 승강기 연동 ──────────────────────────────────────────────
  const ELEV_KEY = process.env.ELEVATOR_API_KEY;
  let elevData = null;

  if (ELEV_KEY && buildingData.platPlc) {
    try {
      // 주소에서 시도/시군구 추출
      // platPlc 예시: "경기도 고양시 덕양구 주교동 600"
      const addrParts = buildingData.platPlc.split(' ');

      // 시도 축약 매핑 (API 파라미터 sido는 "경기", "서울" 형식)
      const sidoMap = {
        '서울특별시':'서울', '부산광역시':'부산', '대구광역시':'대구',
        '인천광역시':'인천', '광주광역시':'광주', '대전광역시':'대전',
        '울산광역시':'울산', '세종특별자치시':'세종', '경기도':'경기',
        '강원특별자치도':'강원', '충청북도':'충북', '충청남도':'충남',
        '전북특별자치도':'전북', '전라남도':'전남', '경상북도':'경북',
        '경상남도':'경남', '제주특별자치도':'제주'
      };
      const sido = sidoMap[addrParts[0]] || addrParts[0];

      // 시군구: "고양시 덕양구" → 두 번째 + 세 번째 파트 조합 (구가 있는 경우)
      // 단순히 두 번째 파트만 사용 (진주시, 수원시 등 단일 시)
      const sigungu = addrParts[1] || '';

      // 1단계: 승강기 목록 조회 (sido + sigungu로)
      const listUrl = `https://apis.data.go.kr/B553664/BuldElevatorService/getElevatorListM`
        + `?serviceKey=${ELEV_KEY}`
        + `&sido=${encodeURIComponent(sido)}`
        + `&sigungu=${encodeURIComponent(sigungu)}`
        + `&pageNo=1&numOfRows=20`;

      const listRes = await fetch(listUrl);
      const listText = await listRes.text();

      if (!listText.trim().startsWith('<')) {
        // JSON 응답인 경우
        const listJson = JSON.parse(listText);
        const listItems = listJson?.response?.body?.items?.item;
        if (listItems) {
          elevData = Array.isArray(listItems) ? listItems : [listItems];
        }
      } else {
        // XML 파싱
        const elevators = [];
        const itemMatches = listText.match(/<item>([\s\S]*?)<\/item>/g) || [];

        for (const item of itemMatches.slice(0, 20)) {
          const get = (tag) => {
            const m = item.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
            return m ? m[1] : '';
          };
          elevators.push({
            elevator_no:      get('elevator_no'),
            elvtrDivNm:       get('elvtrDivNm'),       // 승강기 구분
            elvtrSttsNm:      get('elvtrSttsNm'),       // 상태
            installationDe:   get('installationDe'),    // 설치일
            vldtyEndDe:       get('vldtyEndDe'),        // 검사유효기간 종료
            jdgmentNm:        get('jdgmentNm'),         // 판정결과
            buldNm:           get('buldNm'),            // 건물명
            address1:         get('address1'),          // 소재지
          });
        }

        // 주소 필터링: 건물 주소와 유사한 것만
        const dongName = addrParts[addrParts.length - 2] || ''; // 동 이름
        const bunjiNum = addrParts[addrParts.length - 1] || ''; // 번지
        const filtered = elevators.filter(e =>
          e.address1 && (e.address1.includes(dongName) || e.address1.includes(bunjiNum))
        );

        elevData = filtered.length > 0 ? filtered : elevators.slice(0, 5);
      }

      // 2단계: 검사이력 조회 (첫 번째 승강기의 상세정보)
      if (elevData && elevData.length > 0 && elevData[0].elevator_no) {
        const inspUrl = `https://apis.data.go.kr/B553664/BuldElevatorService/getElvtrInspctInqireM`
          + `?serviceKey=${ELEV_KEY}`
          + `&elevator_no=${elevData[0].elevator_no}`
          + `&pageNo=1&numOfRows=5`;

        const inspRes = await fetch(inspUrl);
        const inspText = await inspRes.text();

        if (inspText.trim().startsWith('<')) {
          // XML 파싱
          const inspMatches = inspText.match(/<item>([\s\S]*?)<\/item>/g) || [];
          if (inspMatches.length > 0) {
            const get = (tag, str) => {
              const m = str.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
              return m ? m[1] : '';
            };
            elevData[0].inspHistory = inspMatches.slice(0, 3).map(item => ({
              inspDe:       get('inspDe', item),      // 검사일
              inspInsttNm:  get('inspInsttNm', item), // 검사기관
              inspTypeNm:   get('inspTypeNm', item),  // 검사종류
              jdgmentNm:    get('jdgmentNm', item),   // 판정결과
            }));
          }
        }
      }

    } catch (e) {
      // 승강기 API 실패해도 건물 데이터는 정상 반환
      elevData = { _error: e.message };
    }
  }

  return res.status(200).json({ data: buildingData, elevator: elevData });
}
