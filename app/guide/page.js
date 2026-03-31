export const metadata = {
  title: '사용 기술서 - CN 수입 원가 계산기',
};

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">CN 수입 원가 계산기 사용 기술서</h1>
      <p className="text-sm text-gray-500 mb-8">CNINSIDER 중국 수입 원가 자동 계산 시스템 v1.0</p>

      <div className="space-y-8 text-sm">

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">1. 접속 방법</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">내 컴퓨터</td><td className="py-2 text-gray-600">http://localhost:3001 (컴퓨터 켜면 자동 실행)</td></tr>
              <tr><td className="py-2 font-medium">같은 와이파이</td><td className="py-2 text-gray-600">http://{IP주소}:3001 (IP가 바뀔 수 있음)</td></tr>
              <tr><td className="py-2 font-medium">외부 접속</td><td className="py-2 text-gray-600">https://harvey-multibranched-mistrustfully.ngrok-free.dev</td></tr>
              <tr><td className="py-2 font-medium">수동 실행</td><td className="py-2 text-gray-600">바탕화면 &gt; 클로드 전용 260320 &gt; <b>수입원가 계산기.bat</b> 더블클릭</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-400">컴퓨터가 켜져있어야 접속 가능합니다.</p>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">2. 첫 화면</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">이름 입력</td><td className="py-2 text-gray-600">처음 접속 시 이름 입력 (한번만, 이후 자동 로그인)</td></tr>
              <tr><td className="py-2 font-medium">사용방법 버튼</td><td className="py-2 text-gray-600">이 페이지를 새 창으로 열기</td></tr>
              <tr><td className="py-2 font-medium">전체 데이터 조회</td><td className="py-2 text-gray-600">저장된 모든 출고 건 데이터 검색/조회</td></tr>
              <tr><td className="py-2 font-medium">환율 비율 평균</td><td className="py-2 text-gray-600">전체 출고건별 위안화 비율 평균 리스트</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">3. 파일 업로드</h2>
          <p className="text-gray-600 mb-3">파일을 드래그앤드롭 영역에 한번에 넣으면 <b>자동 분류</b>됩니다. ZIP 파일도 자동 해제됩니다.</p>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">결제명세서 EXCEL</td><td className="py-2 text-gray-600">CNINSIDER 결제명세서 (단가, 비용, SKU, 환율) - <b className="text-red-600">필수</b></td></tr>
              <tr><td className="py-2 font-medium">출고내역 EXCEL</td><td className="py-2 text-gray-600">CNINSIDER 출고내역 (수량, 상자번호, CBM) - <b className="text-red-600">필수</b></td></tr>
              <tr><td className="py-2 font-medium">청구서 PDF</td><td className="py-2 text-gray-600">CNINSIDER 청구서 (해상운임, 통관, 부대비용) - <b className="text-red-600">필수</b></td></tr>
            </tbody>
          </table>
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            <p className="font-bold text-gray-700 mb-1">자동 분류 규칙:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>파일명에 &quot;출고내역&quot; 포함된 엑셀 → 출고내역</li>
              <li>나머지 엑셀 → 결제명세서</li>
              <li>PDF → 청구서</li>
              <li>ZIP → 자동 압축 해제 후 분류</li>
            </ul>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">4. 파일 형식 검증</h2>
          <p className="text-gray-600 mb-3">파일 형식이 맞지 않으면 에러 팝업이 뜨고 계산이 실행되지 않습니다.</p>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">결제명세서</td><td className="py-2 text-gray-600">SKU, 단가, 총금액, 환율 헤더 필수</td></tr>
              <tr><td className="py-2 font-medium">출고내역</td><td className="py-2 text-gray-600">SKU, 출고수량 헤더 필수</td></tr>
              <tr><td className="py-2 font-medium">청구서</td><td className="py-2 text-gray-600">KRW, TOTAL 텍스트 필수</td></tr>
              <tr><td className="py-2 font-medium">박스수량</td><td className="py-2 text-gray-600">청구서 CTN수와 출고내역 박스수 불일치 시 계산 중단</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">5. 환율</h2>
          <p className="text-gray-600">환율은 <b>결제명세서 Y열(환율 컬럼)</b>에서 상품별로 자동 적용됩니다.</p>
          <p className="text-gray-600 mt-1">별도 환율 입력이 필요 없습니다.</p>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">6. 계산 결과</h2>
          <h3 className="font-bold text-sm text-gray-800 mt-2 mb-2">비용 요약</h3>
          <table className="w-full text-left mb-4">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">최근5건 평균비율</td><td className="py-2 text-gray-600">최근 5건 출고의 위안화 비율 평균 + 건별 상세</td></tr>
              <tr><td className="py-2 font-medium">총 수입원가</td><td className="py-2 text-gray-600">각 SKU의 원가(개당) × 수량 합계</td></tr>
              <tr><td className="py-2 font-medium">총 제품비 (CNY)</td><td className="py-2 text-gray-600">결제명세서 총금액 + 운임 합계 (원화 환산 포함)</td></tr>
              <tr><td className="py-2 font-medium">총 부대비용</td><td className="py-2 text-gray-600">청구서 TOTAL KRW</td></tr>
              <tr><td className="py-2 font-medium">총 수량 / 전체 CBM</td><td className="py-2 text-gray-600">전체 상품 수량 및 CBM</td></tr>
            </tbody>
          </table>
          <h3 className="font-bold text-sm text-gray-800 mt-4 mb-2">SKU별 테이블 컬럼</h3>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">SKU / 개당CBM</td><td className="py-2 text-gray-600">바코드, 상자 CBM ÷ 상자 내 총수량</td></tr>
              <tr><td className="py-2 font-medium">품명 / 수량</td><td className="py-2 text-gray-600">상품명 (정렬 가능), 출고수량</td></tr>
              <tr><td className="py-2 font-medium">단가(CNY)</td><td className="py-2 text-gray-600">총금액 ÷ 세트수량 + 운임단가</td></tr>
              <tr><td className="py-2 font-medium">후불작업비용</td><td className="py-2 text-gray-600">고정 0.7</td></tr>
              <tr><td className="py-2 font-medium">수수료7%</td><td className="py-2 text-gray-600">결제명세서 수수료7% 값</td></tr>
              <tr><td className="py-2 font-medium">원가(개당)</td><td className="py-2 text-gray-600">(단가CNY + 0.7 + 수수료7%) × 환율 + 배분비용</td></tr>
              <tr><td className="py-2 font-medium">평균 원가</td><td className="py-2 text-gray-600">해당 SKU의 전체 출고 건 원가(개당) 평균</td></tr>
              <tr><td className="py-2 font-medium">위안화 비율</td><td className="py-2 text-gray-600">원가(개당) ÷ 단가(CNY)</td></tr>
              <tr><td className="py-2 font-medium">원가(x285)</td><td className="py-2 text-gray-600">순수단가(운임 제외) × 285</td></tr>
              <tr><td className="py-2 font-medium">비용 배분</td><td className="py-2 text-gray-600">수수료1%, 해상운임, DOC FEE, 원산지, 통관, 관세, 부가세, 내륙운송</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">7. 비용 배분 방식</h2>
          <table className="w-full text-left">
            <thead><tr className="text-gray-500"><th className="py-2 w-44">항목</th><th className="py-2">배분 방식</th></tr></thead>
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium">해상운임</td><td className="py-2 text-gray-600">개당 CBM 비례 배분 (WHARFAGE, 창고료, 부대비용 합산)</td></tr>
              <tr><td className="py-2 font-medium">내륙운송료</td><td className="py-2 text-gray-600">개당 CBM 비례 배분</td></tr>
              <tr><td className="py-2 font-medium">수수료1%, DOC FEE, 원산지, 통관</td><td className="py-2 text-gray-600">총수량 기준 균등 배분</td></tr>
              <tr><td className="py-2 font-medium">관세</td><td className="py-2 text-gray-600">정산서 있으면 영문명 매칭 SKU에만, 없으면 균등 배분</td></tr>
              <tr><td className="py-2 font-medium">부가세</td><td className="py-2 text-gray-600">과세가격(단가×환율 + 해상운임 + 관세) 비율 배분</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
          <h2 className="font-bold text-base text-red-700 border-b border-red-200 pb-2 mb-4">8. 색상 표시 의미</h2>
          <table className="w-full text-left">
            <tbody className="divide-y divide-red-100">
              <tr><td className="py-2 font-medium w-44"><span className="text-red-600 font-bold">빨간색</span> 단가(CNY)</td><td className="py-2 text-gray-600">위안화 정보 엑셀과 4위안 이상 차이 (괄호 안이 엑셀 값)</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-blue-600 font-bold">파란색</span> 오차</td><td className="py-2 text-gray-600">배분합/계산기가 더 클 때 (+)</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-red-600 font-bold">빨간색</span> 오차</td><td className="py-2 text-gray-600">배분합/계산기가 더 작을 때 (-)</td></tr>
              <tr><td className="py-2 font-medium"><span className="text-red-600 font-bold">빨간색</span> 비율 평균</td><td className="py-2 text-gray-600">실제 비용 행의 위안화 비율 전체 평균</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">9. 자동 저장</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">저장 시점</td><td className="py-2 text-gray-600">계산 성공 시 자동 저장 (에러 없을 때만)</td></tr>
              <tr><td className="py-2 font-medium">중복 처리</td><td className="py-2 text-gray-600">같은 출고코드(AE260305-227박스)는 덮어쓰기</td></tr>
              <tr><td className="py-2 font-medium">저장 안 되는 경우</td><td className="py-2 text-gray-600">박스수량 불일치, BL NO 불일치 등 에러 발생 시</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">10. 버튼 기능 정리</h2>
          <h3 className="font-bold text-sm text-gray-800 mb-2">메인 화면</h3>
          <table className="w-full text-left mb-4">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">전체 데이터 조회</td><td className="py-2 text-gray-600">저장된 모든 출고 건 검색/정렬/엑셀 다운로드</td></tr>
              <tr><td className="py-2 font-medium">환율 비율 평균</td><td className="py-2 text-gray-600">전체 출고건별 위안화 비율 평균 리스트</td></tr>
              <tr><td className="py-2 font-medium">원가 계산</td><td className="py-2 text-gray-600">파일 업로드 후 수입원가 계산 실행</td></tr>
              <tr><td className="py-2 font-medium">초기화</td><td className="py-2 text-gray-600">모든 파일과 결과 초기화</td></tr>
            </tbody>
          </table>
          <h3 className="font-bold text-sm text-gray-800 mb-2">결과 화면</h3>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">초기화</td><td className="py-2 text-gray-600">처음으로 돌아감</td></tr>
              <tr><td className="py-2 font-medium">컬럼 로직 정리</td><td className="py-2 text-gray-600">각 항목의 계산 방식 상세 설명</td></tr>
              <tr><td className="py-2 font-medium">전체 데이터 조회</td><td className="py-2 text-gray-600">저장된 데이터 검색/조회</td></tr>
              <tr><td className="py-2 font-medium">EXCEL 다운</td><td className="py-2 text-gray-600">현재 계산 결과 엑셀 다운로드 (출고코드 포함)</td></tr>
              <tr><td className="py-2 font-medium">전체보기</td><td className="py-2 text-gray-600">전체 출고건별 비율 평균 리스트</td></tr>
              <tr><td className="py-2 font-medium">사용로그</td><td className="py-2 text-gray-600">누가 언제 무슨 작업을 했는지 확인</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">11. 전체 데이터 조회</h2>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">검색</td><td className="py-2 text-gray-600">바코드(SKU), 상품명, 출고코드로 검색 (키워드 두 개면 둘 다 포함된 것만)</td></tr>
              <tr><td className="py-2 font-medium">정렬</td><td className="py-2 text-gray-600">모든 헤더 클릭으로 오름차순/내림차순 정렬</td></tr>
              <tr><td className="py-2 font-medium">평균 원가</td><td className="py-2 text-gray-600">해당 SKU의 전체 출고 건 원가 평균</td></tr>
              <tr><td className="py-2 font-medium">차이</td><td className="py-2 text-gray-600">원가(x285) - 원가(개당), 빨간색(+)/파란색(-)</td></tr>
              <tr><td className="py-2 font-medium">전체 EXCEL 다운</td><td className="py-2 text-gray-600">저장된 모든 데이터 엑셀 다운로드</td></tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-base text-blue-600 border-b pb-2 mb-4">12. 사용 로그</h2>
          <p className="text-gray-600 mb-2">모든 작업이 자동 기록됩니다.</p>
          <table className="w-full text-left">
            <tbody className="divide-y">
              <tr><td className="py-2 font-medium w-44">기록 항목</td><td className="py-2 text-gray-600">로그인, 파일업로드, 원가계산, 자동저장, EXCEL다운로드, 초기화</td></tr>
              <tr><td className="py-2 font-medium">기록 내용</td><td className="py-2 text-gray-600">시간, 이름, 작업 종류, 상세 내용</td></tr>
              <tr><td className="py-2 font-medium">확인 방법</td><td className="py-2 text-gray-600">오른쪽 상단 &quot;사용로그&quot; 클릭 또는 /logs 페이지</td></tr>
            </tbody>
          </table>
        </section>

      </div>
    </div>
  );
}
