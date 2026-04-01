export const metadata = { title: '컬럼별 계산 로직 - 수입원가 계산기' };

export default function LogicPage() {
  const sections = [
    {
      title: '총 수입원가', bg: 'bg-blue-50', border: 'border-blue-200', items: [
        ['총 수입원가', '1.총 제품비(원화) + 2.총 수수료(원화) + 3.총 부대비용'],
        ['1. 총 제품비(CNY)', '결제명세서 총금액 합 + 운임 합'],
        ['1. 총 제품비(원화)', '각 SKU의 (단가CNY + 0.7 + 수수료7%) x 환율 x 수량 합'],
        ['2. 총 수수료(CNY)', '(0.7 x 총수량) + (수수료7% x 각 SKU 수량 합)'],
        ['2. 총 수수료(원화)', '총 수수료(CNY) x 환율'],
        ['  SOP', '0.7 x 총수량 (후불작업비용)'],
        ['  수수료7%', '결제명세서 수수료7% 컬럼 x 각 SKU 수량 합'],
        ['3. 총 부대비용', '청구서 PDF의 TOTAL KRW'],
      ]
    },
    {
      title: '오차 비교', bg: 'bg-white', border: '', items: [
        ['청구서', '청구서 PDF의 TOTAL KRW'],
        ['배분합', '수수료1% ~ 내륙운송료 각 (개당 x 수량) 총합'],
        ['오차 (KRW)', '배분합 - 청구서 (+ 파란색, - 빨간색)'],
        ['출고내역 CNY', '결제명세서 총금액 합 + 운임 합'],
        ['계산기 CNY', '테이블 단가(CNY) x 수량의 합'],
        ['오차 (CNY)', '계산기 - 출고내역 (+ 파란색, - 빨간색)'],
      ]
    },
    {
      title: '기본 정보', bg: 'bg-white', border: '', items: [
        ['SKU', '결제명세서 SKU (바코드)'],
        ['개당 CBM', '출고내역 박스 CBM / 해당 박스 내 총수량'],
        ['품명', '결제명세서 품명'],
        ['수량', '출고내역 세트수량 > 0이면 세트수량, 아니면 출고수량'],
      ]
    },
    {
      title: '단가 영역', bg: 'bg-pink-50', border: 'border-pink-200', items: [
        ['단가(CNY)', '결제명세서 총금액 / 세트수량 + 운임단가'],
        ['후불작업비용', '고정 0.7'],
        ['수수료7%', '결제명세서 수수료7% 컬럼 값'],
      ]
    },
    {
      title: '원가', bg: 'bg-yellow-50', border: 'border-yellow-200', items: [
        ['원가(개당)', '(단가CNY + 0.7 + 수수료7%) x 상품별환율 + 배분비용(개당)'],
        ['평균원가', '해당 SKU의 전체 출고 건 원가(개당) 평균 (전체데이터 기준)'],
        ['위안화 비율', '원가(개당) / 단가(CNY)'],
        ['원가(x285)', '순수단가(운임 제외) x 285'],
        ['차이', '원가(x285) - 원가(개당) (+ 파란색, - 빨간색)'],
      ]
    },
    {
      title: '비용 배분', bg: 'bg-sky-50', border: 'border-sky-200',
      headers: ['항목', '배분 방식', '출처'],
      rows: [
        ['수수료 1%', '총액 / 전체 수량 (N분의 1)', '청구서'],
        ['해상운임', '개당 CBM 비례 배분 (WHARFAGE+창고료+부대비용 합산)', '청구서'],
        ['DOC FEE', '총액 / 전체 수량 (N분의 1)', '청구서'],
        ['원산지증명서', '총액 / 전체 수량 (N분의 1)', '청구서'],
        ['통관수수료', '총액 / 전체 수량 (N분의 1)', '청구서'],
        ['관세', '정산서 있음 → 영문명 매칭 SKU에만 / 없음 → 균등', '청구서+정산서'],
        ['부가세', '과세가격(단가x환율 + 해상운임 + 관세) 비율 분배', '청구서+정산서'],
        ['내륙운송료', '개당 CBM 비례 배분', '청구서'],
      ]
    },
    {
      title: '환율', bg: 'bg-white', border: '', items: [
        ['상품별 환율', '결제명세서 Y열(환율 컬럼)에서 자동 추출'],
        ['적용 우선순위', '상품별환율 > 청구서환율 > 정산서환율 > 기본값(195)'],
      ]
    },
    {
      title: '위안화 비교', bg: 'bg-red-50', border: 'border-red-200', items: [
        ['비교 대상', '결제명세서 단가(CNY) vs 위안화 정보.xlsx I열'],
        ['매칭 기준', 'SKU (바코드, F열)'],
        ['빨간색 표시', '차이가 4위안 이상일 때 단가(CNY) 셀 빨간색 + 괄호로 값 표시'],
      ]
    },
    {
      title: '실제 비용 / 배분 총합', bg: 'bg-lime-50', border: 'border-lime-200', items: [
        ['실제 비용 행', '청구서 각 항목의 (총금액 + 부가세) 값'],
        ['배분 총합 행', '각 SKU의 (개당 값 x 수량) 합계'],
        ['위안화 비율 평균', '실제비용 행에 전체 SKU의 위안화 비율 평균 표시 (빨간색)'],
        ['파란색 오차', '배분합이 실제비용보다 클 때 (+)'],
        ['빨간색 오차', '배분합이 실제비용보다 작을 때 (-)'],
      ]
    },
    {
      title: '파일 검증', bg: 'bg-white', border: '', items: [
        ['결제명세서', 'SKU, 단가, 총금액, 환율 헤더 필수'],
        ['출고내역', 'SKU, 출고수량 헤더 필수'],
        ['청구서', 'KRW, TOTAL 텍스트 필수'],
        ['박스수량', '청구서 CTN수와 출고내역 박스수 불일치 시 계산 중단'],
        ['B/L NO', '청구서와 정산서의 B/L NO 불일치 시 계산 중단'],
      ]
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">컬럼별 계산 로직 정리</h1>
      <p className="text-sm text-gray-500 mb-8">각 항목의 계산 방식 및 데이터 출처</p>

      <div className="space-y-6 text-sm">
        {sections.map((sec, si) => (
          <section key={si} className={`${sec.bg} rounded-xl shadow-sm border ${sec.border} p-6`}>
            <h2 className="font-bold text-base border-b pb-2 mb-4">{sec.title}</h2>
            {sec.rows ? (
              <table className="w-full text-left">
                <thead><tr className="text-gray-500">{sec.headers.map((h, i) => <th key={i} className="py-2">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{sec.rows.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j} className={`py-2 ${j === 0 ? 'font-medium w-36' : 'text-gray-600'}`}>{cell}</td>)}</tr>
                ))}</tbody>
              </table>
            ) : (
              <table className="w-full text-left">
                <tbody className="divide-y">{sec.items.map(([label, desc], i) => (
                  <tr key={i}><td className="py-2 font-medium w-44">{label}</td><td className="py-2 text-gray-600">{desc}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
