export const metadata = {
  title: '컬럼별 계산 로직 정리 - CN 수입 원가 계산기',
};

export default function LogicPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">컬럼별 계산 로직 정리</h1>
      <p className="text-sm text-gray-500 mb-8">CN 수입 원가 계산기 — 각 항목의 계산 방식 및 데이터 출처</p>

      <div className="space-y-8 text-sm">
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-gray-800 border-b pb-2 mb-4">비교 영역</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">청구서</td><td className="py-2 text-gray-600">청구서 PDF의 TOTAL KRW</td></tr>
              <tr><td className="py-2 font-medium">배분합</td><td className="py-2 text-gray-600">수수료1% ~ 내륙운송료 각 (개당 × 수량) 총합</td></tr>
              <tr><td className="py-2 font-medium">출고내역 CNY</td><td className="py-2 text-gray-600">결제명세서 총금액 합 + R열 운임 합</td></tr>
              <tr><td className="py-2 font-medium">계산기 CNY</td><td className="py-2 text-gray-600">테이블 단가(CNY) × 수량의 합</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-gray-800 border-b pb-2 mb-4">기본 정보</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">SKU</td><td className="py-2 text-gray-600">결제명세서 SKU</td></tr>
              <tr><td className="py-2 font-medium">개당 CBM</td><td className="py-2 text-gray-600">출고내역 박스 CBM ÷ 해당 박스 내 총수량</td></tr>
              <tr><td className="py-2 font-medium">품명</td><td className="py-2 text-gray-600">결제명세서 품명</td></tr>
              <tr><td className="py-2 font-medium">수량</td><td className="py-2 text-gray-600">결제명세서 세트수량</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-pink-50 rounded-xl shadow-sm border border-pink-200 p-6">
          <h2 className="font-bold text-base text-pink-700 border-b border-pink-200 pb-2 mb-4">단가 영역</h2>
          <table className="w-full text-left">
            <tbody className="divide-y divide-pink-100">
              <tr><td className="py-2 font-medium w-44">단가(CNY)</td><td className="py-2 text-gray-600">결제명세서 총금액 ÷ 세트수량 + 운임단가</td></tr>
              <tr><td className="py-2 font-medium">후불작업비용</td><td className="py-2 text-gray-600">고정 0.7</td></tr>
              <tr><td className="py-2 font-medium">수수료7%</td><td className="py-2 text-gray-600">결제명세서 수수료7% 컬럼 값</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-6">
          <h2 className="font-bold text-base text-blue-700 border-b border-blue-200 pb-2 mb-4">원가</h2>
          <table className="w-full text-left">
            <tbody className="divide-y divide-blue-100">
              <tr><td className="py-2 font-medium w-44">원가(개당)</td><td className="py-2 text-gray-600">(단가CNY + 0.7 + 수수료7%) × 위안화환율 + 배분비용 합/개</td></tr>
              <tr><td className="py-2 font-medium">원가(x285)</td><td className="py-2 text-gray-600">순수단가(운임 제외) × 285</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-sky-50 rounded-xl shadow-sm border border-sky-200 p-6">
          <h2 className="font-bold text-base text-sky-700 border-b border-sky-200 pb-2 mb-4">비용 배분 (청구서/정산서 기준)</h2>
          <table className="w-full text-left">
            <thead><tr className="text-gray-500"><th className="py-2 w-44">항목</th><th className="py-2">배분 방식</th><th className="py-2 w-28">출처</th></tr></thead>
            <tbody className="divide-y divide-sky-100">
              <tr><td className="py-2 font-medium">수수료 1%</td><td className="py-2 text-gray-600">총액 ÷ 전체 수량 (N분의 1)</td><td className="py-2 text-gray-500">청구서</td></tr>
              <tr><td className="py-2 font-medium">해상운임</td><td className="py-2 text-gray-600">개당 CBM 비례 배분</td><td className="py-2 text-gray-500">청구서</td></tr>
              <tr><td className="py-2 font-medium">DOC FEE</td><td className="py-2 text-gray-600">총액 ÷ 전체 수량 (N분의 1)</td><td className="py-2 text-gray-500">청구서</td></tr>
              <tr><td className="py-2 font-medium">원산지증명서</td><td className="py-2 text-gray-600">총액 ÷ 전체 수량 (N분의 1)</td><td className="py-2 text-gray-500">청구서</td></tr>
              <tr><td className="py-2 font-medium">통관수수료</td><td className="py-2 text-gray-600">총액 ÷ 전체 수량 (N분의 1)</td><td className="py-2 text-gray-500">청구서</td></tr>
              <tr><td className="py-2 font-medium">관세</td><td className="py-2 text-gray-600">정산서 있음 → 영문명 매칭 SKU에만 분배<br/>정산서 없음 → 총액 ÷ 전체 수량 (N분의 1)</td><td className="py-2 text-gray-500">청구서 + 정산서</td></tr>
              <tr><td className="py-2 font-medium">부가세</td><td className="py-2 text-gray-600">과세가격(단가×환율 + 해상운임 + 관세) 비율 분배</td><td className="py-2 text-gray-500">청구서 + 정산서</td></tr>
              <tr><td className="py-2 font-medium">내륙운송료</td><td className="py-2 text-gray-600">개당 CBM 비례 배분</td><td className="py-2 text-gray-500">청구서</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
          <h2 className="font-bold text-base text-red-700 border-b border-red-200 pb-2 mb-4">위안화 비교</h2>
          <table className="w-full text-left">
            <tbody className="divide-y divide-red-100">
              <tr><td className="py-2 font-medium w-44">비교 대상</td><td className="py-2 text-gray-600">결제명세서 단가(CNY) vs 위안화 정보.xlsx I열(위안화)</td></tr>
              <tr><td className="py-2 font-medium">매칭 기준</td><td className="py-2 text-gray-600">SKU (바코드)</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-red-600 font-bold">빨간색</span> 표시</td><td className="py-2 text-gray-600">차이가 4위안 이상일 때 단가(CNY) 셀 빨간색 + 위안화 정보 값 괄호 표시</td></tr>
              <tr><td className="py-2 font-medium">데이터 경로</td><td className="py-2 text-gray-600">C:\Users\user\Desktop\클로드 전용 260320\위안화 정보.xlsx</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-gray-50 rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-gray-800 border-b pb-2 mb-4">실제 비용 / 배분 총합</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">실제 비용</td><td className="py-2 text-gray-600">청구서 각 항목의 (총금액 + 부가세) 값</td></tr>
              <tr><td className="py-2 font-medium">배분 총합</td><td className="py-2 text-gray-600">모든 컬럼: 각 SKU의 (개당 값 × 수량) 합계</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-blue-600 font-bold">파란색</span> 오차</td><td className="py-2 text-gray-600">배분합/계산기가 더 클 때 (+)</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-red-600 font-bold">빨간색</span> 오차</td><td className="py-2 text-gray-600">배분합/계산기가 더 작을 때 (-)</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
