'use client';

import { useState, useEffect, Fragment } from 'react';

function fmt(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

export default function CostCheckPage() {
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(15);
  const [sortKey, setSortKey] = useState('devPct');
  const [sortDir, setSortDir] = useState('desc');
  const [filterMode, setFilterMode] = useState('all'); // all, flagged
  const [search, setSearch] = useState('');
  const [expandedSku, setExpandedSku] = useState(null);

  useEffect(() => {
    fetch('/api/save-all').then(r => r.json()).then(d => { setAllData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // SKU별 출고 데이터 그룹핑
  const skuMap = {};
  for (const [shipmentKey, entry] of Object.entries(allData)) {
    if (!entry.rows) continue;
    for (const r of entry.rows) {
      if (!r.sku || !r.costPerUnit) continue;
      if (!skuMap[r.sku]) skuMap[r.sku] = { sku: r.sku, productName: r.productName, shipments: [] };
      skuMap[r.sku].shipments.push({
        shipmentKey,
        costPerUnit: r.costPerUnit,
        unitPriceCny: r.unitPriceCny,
        shippedQty: r.shippedQty,
        savedAt: entry.savedAt,
        exchangeRate: r.exchangeRate,
        cbmPerUnit: r.cbmPerUnit,
        productCostKrw: r.productCostKrw,
        commission: r.commission,
        costs: r.costs,
      });
    }
  }

  // SKU별 통계 계산
  const skuStats = Object.values(skuMap).map(item => {
    const costs = item.shipments.map(s => s.costPerUnit);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const avg = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length);
    const totalQty = item.shipments.reduce((s, sh) => s + (sh.shippedQty || 0), 0);
    const weightedAvg = totalQty > 0
      ? Math.round(item.shipments.reduce((s, sh) => s + sh.costPerUnit * (sh.shippedQty || 0), 0) / totalQty)
      : avg;
    const devAmount = max - min;
    const devPct = avg > 0 ? Math.round((devAmount / avg) * 10000) / 100 : 0;
    const flagged = devPct >= threshold && item.shipments.length >= 2;

    return {
      ...item,
      shipCount: item.shipments.length,
      min, max, avg, weightedAvg,
      devAmount, devPct, flagged,
    };
  }).filter(s => s.shipCount >= 2); // 2회 이상 출고된 SKU만

  // 검색
  let filtered = skuStats;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(s => (s.sku + ' ' + s.productName).toLowerCase().includes(q));
  }
  if (filterMode === 'flagged') {
    filtered = filtered.filter(s => s.flagged);
  }

  // 정렬
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : 'asc');
    } else { setSortKey(key); setSortDir('desc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : ' ▼';

  filtered = [...filtered].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') {
      const c = (va || '').localeCompare(vb || '', 'ko');
      return sortDir === 'asc' ? c : -c;
    }
    return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
  });

  const flaggedCount = skuStats.filter(s => s.flagged).length;

  const thCls = 'px-3 py-2.5 text-sm font-semibold whitespace-nowrap cursor-pointer hover:text-blue-600 select-none';

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-8 h-12 flex items-center justify-between">
          <h1 className="text-base font-bold text-[#1a2332]">원가 이상치 분석</h1>
          <button onClick={() => window.close()} className="text-sm text-gray-400 hover:text-gray-600">닫기</button>
        </div>
      </header>

      <div className="px-8 py-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-500 mb-1">분석 대상 SKU</p>
            <p className="text-2xl font-bold text-[#1a2332]">{skuStats.length}<span className="text-sm text-gray-400 ml-1">개</span></p>
            <p className="text-xs text-gray-400 mt-1">2회 이상 출고된 SKU</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-red-500 mb-1">이상치 SKU</p>
            <p className="text-2xl font-bold text-red-600">{flaggedCount}<span className="text-sm text-gray-400 ml-1">개</span></p>
            <p className="text-xs text-gray-400 mt-1">편차 {threshold}% 이상</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-green-600 mb-1">정상 SKU</p>
            <p className="text-2xl font-bold text-green-700">{skuStats.length - flaggedCount}<span className="text-sm text-gray-400 ml-1">개</span></p>
            <p className="text-xs text-gray-400 mt-1">편차 {threshold}% 미만</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-500 mb-1">이상치 기준</p>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={5} max={50} value={threshold} onChange={e => setThreshold(Number(e.target.value))}
                className="flex-1" />
              <span className="text-xl font-bold text-[#1a2332] w-14 text-right">{threshold}%</span>
            </div>
          </div>
        </div>

        {/* 필터 & 검색 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-4">
          <div className="flex gap-1">
            <button onClick={() => setFilterMode('all')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filterMode === 'all' ? 'bg-[#1a2332] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              전체 ({skuStats.length})
            </button>
            <button onClick={() => setFilterMode('flagged')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filterMode === 'flagged' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
              이상치만 ({flaggedCount})
            </button>
          </div>
          <input type="text" placeholder="SKU 또는 상품명 검색..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const wsData = [
              ['SKU', '품명', '출고횟수', '최소원가', '최대원가', '평균원가', '가중평균', '편차(원)', '편차(%)', '이상치'],
              ...filtered.map(s => [s.sku, s.productName, s.shipCount, s.min, s.max, s.avg, s.weightedAvg, s.devAmount, s.devPct, s.flagged ? 'Y' : 'N']),
            ];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:18},{wch:40},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:8},{wch:6}];
            XLSX.utils.book_append_sheet(wb, ws, '원가분석');
            XLSX.writeFile(wb, `원가이상치_${new Date().toISOString().slice(0,10)}.xlsx`);
          }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 whitespace-nowrap">EXCEL 다운</button>
        </div>

        {/* 테이블 */}
        {loading ? <p className="text-gray-500 text-center py-10">로딩중...</p> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead className="bg-[#f5f6fa] border-b border-gray-200">
                  <tr>
                    <th className={`${thCls} text-center w-10`}></th>
                    <th className={`${thCls} text-left`} onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</th>
                    <th className={`${thCls} text-left`} onClick={() => handleSort('productName')}>품명{sortIcon('productName')}</th>
                    <th className={`${thCls} text-center`} onClick={() => handleSort('shipCount')}>출고횟수{sortIcon('shipCount')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('min')}>최소원가{sortIcon('min')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('max')}>최대원가{sortIcon('max')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('avg')}>평균원가{sortIcon('avg')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('weightedAvg')}>가중평균{sortIcon('weightedAvg')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('devAmount')}>편차(원){sortIcon('devAmount')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('devPct')}>편차(%){sortIcon('devPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const bg = s.flagged ? 'bg-red-50' : (i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]');
                    const isExpanded = expandedSku === s.sku;
                    return (
                      <Fragment key={s.sku}>
                        <tr className={`${bg} hover:bg-blue-50/30 cursor-pointer transition-colors`} onClick={() => setExpandedSku(isExpanded ? null : s.sku)}>
                          <td className="px-3 py-2.5 text-center text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">{s.sku}</td>
                          <td className="px-3 py-2.5" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{s.productName}</td>
                          <td className="px-3 py-2.5 text-center font-semibold">{s.shipCount}회</td>
                          <td className="px-3 py-2.5 text-right text-blue-600 font-semibold">{fmt(s.min)}원</td>
                          <td className="px-3 py-2.5 text-right text-red-500 font-semibold">{fmt(s.max)}원</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{fmt(s.avg)}원</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-purple-700">{fmt(s.weightedAvg)}원</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{fmt(s.devAmount)}원</td>
                          <td className={`px-3 py-2.5 text-right font-bold ${s.flagged ? 'text-red-600' : 'text-green-600'}`}>
                            {s.devPct}%
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="px-0 py-0">
                              <div className="bg-gray-50 border-y border-gray-200 px-10 py-3">
                                <table className="text-sm w-full">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="px-3 py-1.5 text-left font-semibold">출고코드</th>
                                      <th className="px-3 py-1.5 text-right font-semibold">단가(CNY)</th>
                                      <th className="px-3 py-1.5 text-right font-semibold">수량</th>
                                      <th className="px-3 py-1.5 text-right font-semibold">원가(개당)</th>
                                      <th className="px-3 py-1.5 text-right font-semibold">평균 대비</th>
                                      <th className="px-3 py-1.5 text-left font-semibold">상태</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.shipments
                                      .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
                                      .map((sh, j) => {
                                        const diff = sh.costPerUnit - s.avg;
                                        const diffPct = s.avg > 0 ? Math.round((diff / s.avg) * 10000) / 100 : 0;
                                        const isOutlier = Math.abs(diffPct) >= threshold;
                                        return (
                                          <tr key={j} className={isOutlier ? 'bg-red-50' : ''}>
                                            <td className="px-3 py-1.5 font-semibold">{sh.shipmentKey}</td>
                                            <td className="px-3 py-1.5 text-right">{sh.unitPriceCny}</td>
                                            <td className="px-3 py-1.5 text-right">{sh.shippedQty}</td>
                                            <td className="px-3 py-1.5 text-right font-semibold">{fmt(sh.costPerUnit)}원</td>
                                            <td className={`px-3 py-1.5 text-right font-semibold ${diff >= 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                              {diff >= 0 ? '+' : ''}{fmt(diff)}원 ({diffPct >= 0 ? '+' : ''}{diffPct}%)
                                            </td>
                                            <td className="px-3 py-1.5">
                                              {isOutlier
                                                ? <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-semibold">이상치</span>
                                                : <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded text-xs font-semibold">정상</span>}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>

                                {/* 원인 분석 */}
                                {s.shipments.length >= 2 && (() => {
                                  const sorted = [...s.shipments].sort((a, b) => a.costPerUnit - b.costPerUnit);
                                  const lo = sorted[0];
                                  const hi = sorted[sorted.length - 1];
                                  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
                                  const costLabels = { purchasingFee:'수수료1%', oceanFreight:'해상운임', documentFee:'DOC FEE', originCertFee:'원산지증명서', customsClearanceFee:'통관수수료', customsDuty:'관세', vat:'부가세', domesticTransport:'내륙운송료' };

                                  const factors = [];

                                  // 단가 차이
                                  const cnyDiff = (hi.unitPriceCny || 0) - (lo.unitPriceCny || 0);
                                  if (Math.abs(cnyDiff) >= 0.5) {
                                    const rate = hi.exchangeRate || lo.exchangeRate || 195;
                                    factors.push({ label: '단가(CNY) 차이', diff: Math.round(cnyDiff * rate), detail: `${lo.unitPriceCny} → ${hi.unitPriceCny} CNY (${cnyDiff >= 0 ? '+' : ''}${Math.round(cnyDiff * 100) / 100})` });
                                  }

                                  // 수량 차이 → 부대비용 배분 영향
                                  if (lo.shippedQty !== hi.shippedQty) {
                                    factors.push({ label: '수량 차이 (배분 영향)', diff: null, detail: `${lo.shipmentKey}: ${lo.shippedQty}개 / ${hi.shipmentKey}: ${hi.shippedQty}개 → 수량 적을수록 고정비 배분↑` });
                                  }

                                  // CBM 차이
                                  if (lo.cbmPerUnit && hi.cbmPerUnit && lo.cbmPerUnit !== hi.cbmPerUnit) {
                                    factors.push({ label: 'CBM 차이', diff: null, detail: `${lo.cbmPerUnit} → ${hi.cbmPerUnit} → CBM 기반 비용 배분 차이` });
                                  }

                                  // 비용 항목별 차이
                                  const costDiffs = [];
                                  for (const k of costKeys) {
                                    const loVal = lo.costs?.[k]?.perUnit || 0;
                                    const hiVal = hi.costs?.[k]?.perUnit || 0;
                                    const d = hiVal - loVal;
                                    if (Math.abs(d) >= 1) {
                                      costDiffs.push({ key: k, label: costLabels[k], loCost: loVal, hiCost: hiVal, diff: d });
                                    }
                                  }
                                  costDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

                                  const totalCostDiff = hi.costPerUnit - lo.costPerUnit;

                                  return (
                                    <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
                                      <h4 className="text-sm font-bold text-[#1a2332] mb-3">원가 차이 원인 분석</h4>
                                      <p className="text-sm text-gray-600 mb-3">
                                        <span className="font-semibold text-blue-600">{lo.shipmentKey}</span> ({fmt(lo.costPerUnit)}원) vs
                                        <span className="font-semibold text-red-500 ml-1">{hi.shipmentKey}</span> ({fmt(hi.costPerUnit)}원)
                                        = <span className="font-bold">차이 {fmt(totalCostDiff)}원</span>
                                      </p>

                                      {factors.length > 0 && (
                                        <div className="mb-3">
                                          <p className="text-xs font-semibold text-gray-500 mb-1.5">주요 요인</p>
                                          {factors.map((f, fi) => (
                                            <div key={fi} className="flex items-start gap-2 text-sm mb-1">
                                              <span className="text-orange-500 font-bold mt-0.5">!</span>
                                              <div>
                                                <span className="font-semibold">{f.label}</span>
                                                {f.diff != null && <span className="ml-1 text-red-500 font-semibold">(+{fmt(f.diff)}원)</span>}
                                                <p className="text-xs text-gray-500">{f.detail}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {costDiffs.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-500 mb-1.5">비용 항목별 차이 (영향 큰 순)</p>
                                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                            {costDiffs.map(cd => (
                                              <div key={cd.key} className="flex items-center justify-between text-sm">
                                                <span className="text-gray-700">{cd.label}</span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-gray-400">{fmt(cd.loCost)} → {fmt(cd.hiCost)}</span>
                                                  <span className={`font-semibold ${cd.diff > 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                    {cd.diff > 0 ? '+' : ''}{fmt(cd.diff)}원
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm font-bold">
                                            <span>합계</span>
                                            <span className="text-red-500">+{fmt(costDiffs.reduce((s, cd) => s + cd.diff, 0))}원</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
