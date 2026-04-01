export const metadata = { title: '사용방법 - 수입원가 계산기' };

export default function GuidePage() {
  const sections = [
    {
      title: '1. 파일 업로드', items: [
        ['결제명세서 (필수)', 'Excel - SKU, 단가, 총금액, 환율 포함'],
        ['출고내역 (필수)', 'Excel - 수량, 상자번호, CBM 포함'],
        ['청구서 (필수)', 'PDF - 해상운임, 통관비용 등 부대비용'],
        ['수입정산서 (선택)', 'PDF - 관세/부가세 정확한 금액'],
      ]
    },
    {
      title: '2. 환율', items: [
        ['자동 적용', '결제명세서 Y열(환율 컬럼)에서 상품별 자동 추출'],
        ['별도 입력 불필요', '환율 입력란 없이 자동 처리'],
      ]
    },
    {
      title: '3. 계산 결과', items: [
        ['단가(CNY)', '총금액 / 세트수량 + 운임단가'],
        ['원가(개당)', '(단가CNY + 0.7 + 수수료7%) x 환율 + 배분비용'],
        ['평균 원가', '해당 SKU의 전체 출고건 원가 평균'],
        ['위안화 비율', '원가(개당) / 단가(CNY)'],
        ['원가(x285)', '순수단가(운임 제외) x 285'],
      ]
    },
    {
      title: '4. 비용 배분 방식', items: [
        ['해상운임', '개당 CBM 비례 (WHARFAGE, 창고료, 부대비용 합산)'],
        ['내륙운송료', '개당 CBM 비례'],
        ['수수료/DOC/원산지/통관', '총수량 균등 배분'],
        ['관세', '정산서 있으면 영문명 매칭 SKU에만, 없으면 균등'],
        ['부가세', '과세가격 비율 배분'],
      ]
    },
    {
      title: '5. 색상 표시', items: [
        ['빨간색 단가', '위안화 정보 엑셀과 4위안 이상 차이'],
        ['파란색 오차', '배분합/계산기가 더 클 때 (+)'],
        ['빨간색 오차', '배분합/계산기가 더 작을 때 (-)'],
      ]
    },
    {
      title: '6. 자동 저장', items: [
        ['저장 시점', '계산 성공 시 자동 (에러 없을 때만)'],
        ['중복 처리', '같은 출고코드는 덮어쓰기'],
      ]
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">수입원가 계산기 사용방법</h1>
      <p className="text-sm text-gray-500 mb-8">CNINSIDER 중국 수입 원가 자동 계산 시스템</p>

      <div className="space-y-6">
        {sections.map((sec, si) => (
          <section key={si} className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">{sec.title}</h2>
            <table className="w-full text-sm text-left">
              <tbody className="divide-y">
                {sec.items.map(([label, desc], i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium w-44">{label}</td>
                    <td className="py-2 text-gray-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
