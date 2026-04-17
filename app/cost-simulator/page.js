'use client';
import { useState, useMemo } from 'react';

const fmt = (n) => (n ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export default function CostSimulator() {
  // 기본 입력
  const [unitPrice, setUnitPrice] = useState('');       // 순수단가 (CNY)
  const [freightPrice, setFreightPrice] = useState(''); // 운임단가 (CNY)
  const [width, setWidth] = useState('');                // 가로 cm
  const [height, setHeight] = useState('');              // 세로 cm
  const [depth, setDepth] = useState('');                // 높이 cm
  const [qty, setQty] = useState('1');                   // 수량

  // 상세 설정
  const [showDetail, setShowDetail] = useState(false);
  const [exchangeRate, setExchangeRate] = useState('210');
  const [postpaidFee, setPostpaidFee] = useState('0.7');       // 후불수수료 CNY
  const [commission, setCommission] = useState('0');            // 구매수수료 CNY
  const [oceanFreightPerCbm, setOceanFreightPerCbm] = useState('98000'); // 해상운임 원/CBM
  const [domesticPerCbm, setDomesticPerCbm] = useState('50000');          // 내륙운송 원/CBM
  const [purchasingFeeRate, setPurchasingFeeRate] = useState('1');         // 수수료1% (한화제품가 대비 %)
  const [docFeeTotal, setDocFeeTotal] = useState('27500');                 // DOC 건당
  const [originCertTotal, setOriginCertTotal] = useState('35000');         // 원산지 건당
  const [clearanceFeeTotal, setClearanceFeeTotal] = useState('33000');     // 통관 건당
  const [shipmentQty, setShipmentQty] = useState('4000');                  // 출고수량 (건당 총수량)
  const [dutyRate, setDutyRate] = useState('0');           // 관세율 %
  const [vatRate, setVatRate] = useState('10');             // 부가세율 %

  const calc = useMemo(() => {
    const up = parseFloat(unitPrice) || 0;
    const fp = parseFloat(freightPrice) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const d = parseFloat(depth) || 0;
    const q = parseInt(qty) || 1;
    const rate = parseFloat(exchangeRate) || 195;
    const ppFee = parseFloat(postpaidFee) || 0;
    const comm = parseFloat(commission) || 0;
    const ofCbm = parseFloat(oceanFreightPerCbm) || 0;
    const dmCbm = parseFloat(domesticPerCbm) || 0;
    const pfRate = (parseFloat(purchasingFeeRate) || 0) / 100;
    const docTotal = parseFloat(docFeeTotal) || 0;
    const originTotal = parseFloat(originCertTotal) || 0;
    const clearTotal = parseFloat(clearanceFeeTotal) || 0;
    const sQty = parseInt(shipmentQty) || 1;
    const dRate = (parseFloat(dutyRate) || 0) / 100;
    const vRate = (parseFloat(vatRate) || 0) / 100;

    if (up <= 0) return null;

    // CBM 계산
    const cbmPerUnit = (w * h * d) / 1000000;

    // 원화 제품가 (순수단가 + 운임단가 + 후불수수료 + 수수료) × 환율
    const totalCny = up + fp + ppFee + comm;
    const productCostKrw = totalCny * rate;

    // 수수료1% (한화제품가 기준)
    const purchasingUnit = productCostKrw * pfRate;

    // CBM 기반 비용
    const oceanFreightUnit = cbmPerUnit * ofCbm;
    const domesticUnit = cbmPerUnit * dmCbm;

    // 건당 고정비 ÷ 출고수량
    const docUnit = docTotal / sQty;
    const originCertUnit = originTotal / sQty;
    const clearanceUnit = clearTotal / sQty;

    // 과세가격 (관세 기준): 한화제품가 + 해상운임
    const taxablePrice = productCostKrw + oceanFreightUnit;
    const dutyUnit = taxablePrice * dRate;

    // 부가세 기준가 = 과세가격 + 관세
    const vatBase = taxablePrice + dutyUnit;
    const vatUnit = vatBase * vRate;

    // 총 수입원가 (개당)
    const costPerUnit = productCostKrw + purchasingUnit + oceanFreightUnit + docUnit
      + originCertUnit + clearanceUnit + dutyUnit + vatUnit + domesticUnit;

    const totalCost = costPerUnit * q;

    return {
      cbmPerUnit,
      totalCny,
      productCostKrw,
      purchasingUnit,
      oceanFreightUnit,
      docUnit,
      originCertUnit,
      clearanceUnit,
      dutyUnit,
      vatUnit,
      domesticUnit,
      costPerUnit,
      totalCost,
      q,
    };
  }, [unitPrice, freightPrice, width, height, depth, qty, exchangeRate, postpaidFee, commission, oceanFreightPerCbm, domesticPerCbm, purchasingFeeRate, docFeeTotal, originCertTotal, clearanceFeeTotal, shipmentQty, dutyRate, vatRate]);

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5';

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex">
      {/* 사이드바 */}
      <aside className="w-[200px] bg-[#1a2332] min-h-screen flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen z-50">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-[#2a3a52]">
          <div className="w-7 h-7 bg-[#3b82f6] rounded-lg flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">IC</span>
          </div>
          <span className="text-white font-bold text-sm">수입원가 계산기</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <button onClick={() => window.open('/', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            원가 계산기
          </button>
          <div className="bg-[#253347] text-blue-400 rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center gap-2.5 cursor-default">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            원가 시뮬레이터
          </div>
          <button onClick={() => window.open('/confirmed-cbm', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            확정CBM 원가
          </button>
          <button onClick={() => window.open('/data', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
            원가 계산 원본
          </button>
          <button onClick={() => window.open('/todo', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            TO DO
          </button>
          <button onClick={() => window.open('/logs', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            로그
          </button>
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 ml-[200px] min-w-0">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="px-8 h-12 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1a2332]">원가 시뮬레이터</h2>
            <span className="text-xs text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span>
          </div>
        </header>

        <div className="p-8 max-w-[900px] mx-auto space-y-6">
          {/* 기본 입력 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-[#1a2332] mb-5 flex items-center gap-2">
              <span className="w-5 h-5 bg-blue-500 text-white rounded flex items-center justify-center text-xs font-bold">1</span>
              기본 정보 입력
            </h3>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* 순수단가 */}
              <div>
                <label className={labelCls}>순수단가 (CNY) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="예: 5.5" className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">&#165;</span>
                </div>
              </div>
              {/* 운임단가 */}
              <div>
                <label className={labelCls}>운임단가 (CNY) <span className="text-gray-300">선택</span></label>
                <div className="relative">
                  <input type="number" step="0.01" value={freightPrice} onChange={e => setFreightPrice(e.target.value)} placeholder="예: 1.2" className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">&#165;</span>
                </div>
              </div>
            </div>

            {/* 상품 크기 */}
            <div className="mt-4">
              <label className={labelCls}>상품 크기 (cm)</label>
              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <input type="number" step="0.1" value={width} onChange={e => setWidth(e.target.value)} placeholder="가로" className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cm</span>
                </div>
                <div className="relative">
                  <input type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)} placeholder="세로" className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cm</span>
                </div>
                <div className="relative">
                  <input type="number" step="0.1" value={depth} onChange={e => setDepth(e.target.value)} placeholder="높이" className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cm</span>
                </div>
              </div>
            </div>

            {/* 수량 */}
            <div className="mt-4 max-w-[200px]">
              <label className={labelCls}>수량</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className={inputCls} />
            </div>
          </section>

          {/* 상세 설정 */}
          <section className="bg-white rounded-xl border border-gray-200">
            <button onClick={() => setShowDetail(!showDetail)} className="w-full px-6 py-4 flex items-center justify-between text-sm font-bold text-[#1a2332] hover:bg-gray-50 transition-colors rounded-xl">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 bg-gray-400 text-white rounded flex items-center justify-center text-xs font-bold">2</span>
                상세 비용 설정
              </span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showDetail ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showDetail && (
              <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <div>
                    <label className={labelCls}>환율 (원/CNY)</label>
                    <input type="number" step="0.1" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>후불수수료 (CNY/개)</label>
                    <input type="number" step="0.1" value={postpaidFee} onChange={e => setPostpaidFee(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>구매수수료 (CNY/개)</label>
                    <input type="number" step="0.1" value={commission} onChange={e => setCommission(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>수수료 (%)</label>
                    <input type="number" step="0.1" value={purchasingFeeRate} onChange={e => setPurchasingFeeRate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>해상운임 (원/CBM)</label>
                    <input type="number" step="1000" value={oceanFreightPerCbm} onChange={e => setOceanFreightPerCbm(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>내륙운송 (원/CBM)</label>
                    <input type="number" step="1000" value={domesticPerCbm} onChange={e => setDomesticPerCbm(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>DOC 건당 (원)</label>
                    <input type="number" step="500" value={docFeeTotal} onChange={e => setDocFeeTotal(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>원산지 건당 (원)</label>
                    <input type="number" step="500" value={originCertTotal} onChange={e => setOriginCertTotal(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>통관 건당 (원)</label>
                    <input type="number" step="500" value={clearanceFeeTotal} onChange={e => setClearanceFeeTotal(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>출고수량 (건당 총수량)</label>
                    <input type="number" step="100" value={shipmentQty} onChange={e => setShipmentQty(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>관세율 (%)</label>
                    <input type="number" step="0.1" value={dutyRate} onChange={e => setDutyRate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>부가세율 (%)</label>
                    <input type="number" step="0.1" value={vatRate} onChange={e => setVatRate(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 계산 결과 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-[#1a2332] mb-5 flex items-center gap-2">
              <span className="w-5 h-5 bg-green-500 text-white rounded flex items-center justify-center text-xs font-bold">3</span>
              계산 결과
            </h3>

            {!calc ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                순수단가를 입력하면 자동으로 계산됩니다
              </div>
            ) : (
              <div className="space-y-5">
                {/* 최종 단가 카드 */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-blue-500 font-semibold mb-1">예상 수입원가 (개당)</div>
                    <div className="text-3xl font-bold text-blue-700">{fmt(Math.round(calc.costPerUnit))} <span className="text-lg">원</span></div>
                  </div>
                  {calc.q > 1 && (
                    <div className="text-right">
                      <div className="text-xs text-blue-500 font-semibold mb-1">총 원가 ({fmt(calc.q)}개)</div>
                      <div className="text-2xl font-bold text-blue-600">{fmt(Math.round(calc.totalCost))} <span className="text-base">원</span></div>
                    </div>
                  )}
                </div>

                {/* CBM 정보 */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">개당 CBM:</span>
                    <span className="ml-2 font-semibold text-[#1a2332]">{calc.cbmPerUnit > 0 ? calc.cbmPerUnit.toFixed(6) : '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">위안 합계:</span>
                    <span className="ml-2 font-semibold text-[#1a2332]">{fmt(calc.totalCny)} CNY</span>
                  </div>
                  <div>
                    <span className="text-gray-500">한화 제품가:</span>
                    <span className="ml-2 font-semibold text-[#1a2332]">{fmt(Math.round(calc.productCostKrw))} 원</span>
                  </div>
                </div>

                {/* 비용 내역 */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">항목</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-600">개당 (원)</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-600">비중</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">참고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['제품가 (CNY→KRW)', calc.productCostKrw, `${fmt(calc.totalCny)}CNY × ${exchangeRate}원`],
                        ['수수료1%', calc.purchasingUnit, `제품가 × ${purchasingFeeRate}%`],
                        ['해상운임', calc.oceanFreightUnit, `${calc.cbmPerUnit.toFixed(4)}CBM × ${fmt(parseFloat(oceanFreightPerCbm))}원`],
                        ['DOC', calc.docUnit, `${fmt(parseFloat(docFeeTotal))}원 ÷ ${shipmentQty}개`],
                        ['원산지', calc.originCertUnit, `${fmt(parseFloat(originCertTotal))}원 ÷ ${shipmentQty}개`],
                        ['통관', calc.clearanceUnit, `${fmt(parseFloat(clearanceFeeTotal))}원 ÷ ${shipmentQty}개`],
                        ['관세', calc.dutyUnit, dutyRate > 0 ? `과세가격 × ${dutyRate}%` : '관세율 0%'],
                        ['부가세', calc.vatUnit, `(제품가+해상운임+관세) × ${vatRate}%`],
                        ['내륙운송', calc.domesticUnit, `${calc.cbmPerUnit.toFixed(4)}CBM × ${fmt(parseFloat(domesticPerCbm))}원`],
                      ].map(([label, val, ref], i) => (
                        <tr key={i} className={`border-b border-gray-100 ${i === 0 ? 'bg-blue-50/50' : ''}`}>
                          <td className="px-4 py-2.5 text-gray-700">{label}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-[#1a2332]">{fmt(Math.round(val))}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{calc.costPerUnit > 0 ? (val / calc.costPerUnit * 100).toFixed(1) + '%' : '-'}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{ref}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-[#1a2332]">합계</td>
                        <td className="px-4 py-3 text-right text-blue-600">{fmt(Math.round(calc.costPerUnit))}</td>
                        <td className="px-4 py-3 text-right text-gray-500">100%</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 초기화 */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { setUnitPrice(''); setFreightPrice(''); setWidth(''); setHeight(''); setDepth(''); setQty('1'); }}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    초기화
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
