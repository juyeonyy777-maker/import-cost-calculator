'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';

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
  const [compareSort, setCompareSort] = useState(null);
  const [displayCount, setDisplayCount] = useState(100);
  const [costInputSku, setCostInputSku] = useState(null);
  const [costInputVal, setCostInputVal] = useState('');
  const [selectedShipments, setSelectedShipments] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [memos, setMemos] = useState({});
  const [reasons, setReasons] = useState({});

  // 확인완료 상태 + 메모 + 사유 localStorage에서 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem('costcheck_confirmed');
      if (saved) setConfirmed(JSON.parse(saved));
      const savedMemos = localStorage.getItem('costcheck_memos');
      if (savedMemos) setMemos(JSON.parse(savedMemos));
      const savedReasons = localStorage.getItem('costcheck_reasons');
      if (savedReasons) setReasons(JSON.parse(savedReasons));
    } catch {}
  }, []);

  const toggleConfirm = (sku, e) => {
    e.stopPropagation();
    setConfirmed(prev => {
      const next = { ...prev, [sku]: !prev[sku] };
      localStorage.setItem('costcheck_confirmed', JSON.stringify(next));
      return next;
    });
  };

  const updateMemo = (sku, text) => {
    setMemos(prev => {
      const next = { ...prev, [sku]: text };
      localStorage.setItem('costcheck_memos', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    fetch('/api/save-all').then(r => r.json()).then(d => { setAllData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // SKU별 출고 데이터 그룹핑
  const skuMap = {};
  for (const [shipmentKey, entry] of Object.entries(allData)) {
    if (!entry.rows) continue;
    for (const r of entry.rows) {
      if (!r.sku || !r.costPerUnit) continue;
      if (!skuMap[r.sku]) skuMap[r.sku] = { sku: r.sku, productName: r.productName, labelName: r.labelName, shipments: [] };
      if (r.labelName && !skuMap[r.sku].labelName) skuMap[r.sku].labelName = r.labelName;
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
        boxSize: r.boxSize,
        boxSizes: r.boxSizes,
        unitPriceRaw: r.unitPriceRaw,
        chinaShippingPerUnit: r.chinaShippingPerUnit,
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
  });

  // 검색
  let filtered = skuStats;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(s => (s.sku + ' ' + (s.labelName || '') + ' ' + s.productName).toLowerCase().includes(q));
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
            <p className="text-xs text-gray-400 mt-1">전체 SKU</p>
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
                    <th className={`${thCls} text-left`} onClick={() => handleSort('productName')}>라벨명{sortIcon('productName')}</th>
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
                  {filtered.slice(0, displayCount).map((s, i) => {
                    const bg = s.flagged ? 'bg-red-50' : (i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]');
                    const isExpanded = expandedSku === s.sku;
                    return (
                      <Fragment key={s.sku}>
                        <tr className={`${bg} hover:bg-blue-50/30 cursor-pointer transition-colors`} onClick={() => setExpandedSku(isExpanded ? null : s.sku)}>
                          <td className="px-3 py-2.5 text-center text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">{s.sku}</td>
                          <td className="px-3 py-2.5" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{s.labelName || s.productName}</td>
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
                              <div className="bg-gray-50 border-y border-gray-200 py-5 flex justify-center">
                              <div className="w-full max-w-[1400px]">

                                {/* 출고건 선택 */}
                                {(() => {
                                  // 같은 상품명의 다른 SKU 출고건도 수집
                                  const baseName = (s.labelName || s.productName || '').split(',')[0].trim();
                                  const relatedShipments = [];
                                  // 현재 SKU 출고건
                                  for (const sh of s.shipments) {
                                    relatedShipments.push({ ...sh, sku: s.sku, option: (s.labelName || '').split(',').slice(1).join(',').trim() || s.sku, isSelf: true });
                                  }
                                  // 같은 상품명의 다른 SKU 출고건
                                  for (const other of skuStats) {
                                    if (other.sku === s.sku) continue;
                                    const otherBase = (other.labelName || other.productName || '').split(',')[0].trim();
                                    if (otherBase === baseName && baseName.length > 3) {
                                      for (const sh of other.shipments) {
                                        relatedShipments.push({ ...sh, sku: other.sku, option: (other.labelName || '').split(',').slice(1).join(',').trim() || other.sku, isSelf: false });
                                      }
                                    }
                                  }

                                  const sel = selectedShipments[s.sku] || (s.shipments.length === 2 ? [0, 1] : []);
                                  const toggleSel = (idx) => {
                                    setSelectedShipments(prev => {
                                      const cur = prev[s.sku] || (s.shipments.length === 2 ? [0, 1] : []);
                                      const next = cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx].slice(-5);
                                      return { ...prev, [s.sku]: next };
                                    });
                                  };
                                  const sortedShipments = [...relatedShipments].sort((a, b) => {
                                    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
                                    return (a.shipmentKey || '').localeCompare(b.shipmentKey || '');
                                  });
                                  const hasRelated = relatedShipments.some(r => !r.isSelf);
                                  return (
                                    <div className="mb-5">
                                      <p className="text-xs font-semibold text-gray-500 mb-2">
                                        출고건별 원가 확정 — {relatedShipments.length}건
                                        {hasRelated && <span className="text-blue-500 ml-1">(같은 상품 다른 옵션 포함)</span>}
                                        <span className="ml-2">(비교: 최대 5개 선택)</span>
                                      </p>
                                      <div className="space-y-2">
                                        {sortedShipments.map((sh, j) => {
                                          const origIdx = relatedShipments.indexOf(sh);
                                          const isSelected = sel.includes(origIdx);
                                          const diff = sh.costPerUnit - s.avg;
                                          const diffPct = s.avg > 0 ? Math.round((diff / s.avg) * 10000) / 100 : 0;
                                          const cKey = `${sh.sku}_${sh.shipmentKey}`;
                                          const isConfirmed = confirmed[cKey];
                                          const confirmedCost = memos[cKey];
                                          return (
                                            <div key={j} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${isSelected ? 'bg-blue-50 border-blue-400' : sh.isSelf ? 'bg-white border-gray-200' : 'bg-purple-50/50 border-purple-200'}`}>
                                              {/* 비교 선택 체크 */}
                                              <input type="checkbox" checked={isSelected}
                                                onChange={() => toggleSel(origIdx)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="shrink-0" />
                                              {/* 출고건 정보 */}
                                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <span className="font-bold text-[#1a2332] shrink-0">{sh.shipmentKey}</span>
                                                {!sh.isSelf && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold shrink-0">다른옵션</span>}
                                                {sh.option && <span className="text-xs text-gray-400 truncate">{sh.option}</span>}
                                                <span className="text-gray-300">|</span>
                                                <span className="font-bold">{fmt(sh.costPerUnit)}원</span>
                                                <span className={`text-xs ${diff >= 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                  ({diffPct >= 0 ? '+' : ''}{diffPct}%)
                                                </span>
                                                {isConfirmed && confirmedCost && (
                                                  <span className="text-xs font-bold text-green-600 ml-1">→ 확정 {fmt(Number(confirmedCost))}원</span>
                                                )}
                                              </div>
                                              {/* 원가확정 */}
                                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {costInputSku === cKey && !isConfirmed ? (
                                                  <>
                                                    <input type="number" placeholder="원가" autoFocus
                                                      value={costInputVal}
                                                      onChange={(e) => setCostInputVal(e.target.value)}
                                                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-right" />
                                                    <span className="text-xs text-gray-400">원</span>
                                                    <button onClick={() => {
                                                      if (costInputVal) {
                                                        updateMemo(cKey, costInputVal);
                                                        setConfirmed(prev => { const next = {...prev, [cKey]: true}; localStorage.setItem('costcheck_confirmed', JSON.stringify(next)); return next; });
                                                        setCostInputSku(null);
                                                      }
                                                    }} className="px-2 py-1 bg-green-500 text-white rounded text-xs font-bold hover:bg-green-600">확정</button>
                                                    <button onClick={() => setCostInputSku(null)} className="px-2 py-1 bg-gray-200 text-gray-500 rounded text-xs font-bold">취소</button>
                                                  </>
                                                ) : (
                                                  <button onClick={() => {
                                                    if (isConfirmed) {
                                                      setConfirmed(prev => { const next = {...prev}; delete next[cKey]; localStorage.setItem('costcheck_confirmed', JSON.stringify(next)); return next; });
                                                      updateMemo(cKey, '');
                                                    } else {
                                                      setCostInputSku(cKey);
                                                      setCostInputVal(String(Math.round(sh.costPerUnit)));
                                                    }
                                                  }}
                                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${isConfirmed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                                                    {isConfirmed ? '원가 확정' : '원가입력'}
                                                  </button>
                                                )}
                                                <textarea placeholder="메모" rows={1}
                                                  value={reasons[cKey] || ''}
                                                  onChange={(e) => {
                                                    setReasons(prev => {
                                                      const next = { ...prev, [cKey]: e.target.value };
                                                      localStorage.setItem('costcheck_reasons', JSON.stringify(next));
                                                      return next;
                                                    });
                                                  }}
                                                  onFocus={(e) => { e.target.rows = 5; e.target.style.width = '200px'; }}
                                                  onBlur={(e) => { e.target.rows = 1; e.target.style.width = '100px'; }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="w-[100px] px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400 resize-none transition-all" />
                                                <textarea placeholder="해야할일" rows={1}
                                                  value={(() => { try { return JSON.parse(localStorage.getItem('costcheck_todos') || '{}')[cKey] || ''; } catch { return ''; } })()}
                                                  onChange={(e) => {
                                                    const todos = JSON.parse(localStorage.getItem('costcheck_todos') || '{}');
                                                    todos[cKey] = e.target.value;
                                                    localStorage.setItem('costcheck_todos', JSON.stringify(todos));
                                                    setConfirmed(p => ({...p}));
                                                  }}
                                                  onFocus={(e) => { e.target.rows = 5; e.target.style.width = '200px'; }}
                                                  onBlur={(e) => { e.target.rows = 1; e.target.style.width = '100px'; }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="w-[100px] px-2 py-1 text-xs border border-orange-200 rounded focus:outline-none focus:border-orange-400 resize-none transition-all" />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* 선택한 출고건 비교 */}
                                {(() => {
                                  const sel = selectedShipments[s.sku] || (s.shipments.length === 2 ? [0, 1] : []);
                                  if (sel.length < 2) return <p className="text-sm text-gray-400 text-center py-4">비교할 출고건을 2~3개 선택하세요</p>;
                                  const allShips = (() => {
                                    const base = (s.labelName || s.productName || '').split(',')[0].trim();
                                    const arr = [...s.shipments.map(sh => ({...sh, sku: s.sku, option: (s.labelName||'').split(',').slice(1).join(',').trim()}))];
                                    for (const other of skuStats) {
                                      if (other.sku === s.sku) continue;
                                      const ob = (other.labelName || other.productName || '').split(',')[0].trim();
                                      if (ob === base && base.length > 3) {
                                        for (const sh of other.shipments) arr.push({...sh, sku: other.sku, option: (other.labelName||'').split(',').slice(1).join(',').trim()});
                                      }
                                    }
                                    return arr;
                                  })();
                                  const selected = sel.map(i => allShips[i]).filter(Boolean).sort((a, b) => a.costPerUnit - b.costPerUnit);
                                  const lo = selected[0];
                                  const hi = selected[selected.length - 1];
                                  const totalCostDiff = hi.costPerUnit - lo.costPerUnit;
                                  const diffPct = lo.costPerUnit > 0 ? Math.round((totalCostDiff / lo.costPerUnit) * 10000) / 100 : 0;

                                  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
                                  const costLabels = { purchasingFee:'구매대행 수수료', oceanFreight:'해상운임', documentFee:'DOC FEE', originCertFee:'원산지증명서', customsClearanceFee:'통관수수료', customsDuty:'관세', vat:'부가세', domesticTransport:'내륙운송료' };

                                  const costDiffs = [];
                                  for (const k of costKeys) {
                                    const loVal = lo.costs?.[k]?.perUnit || 0;
                                    const hiVal = hi.costs?.[k]?.perUnit || 0;
                                    costDiffs.push({ key: k, label: costLabels[k], loCost: loVal, hiCost: hiVal, diff: hiVal - loVal });
                                  }

                                  // 핵심 이슈 자동 생성
                                  const issues = [];
                                  const cnyDiff = (hi.unitPriceCny || 0) - (lo.unitPriceCny || 0);
                                  if (Math.abs(cnyDiff) >= 0.5) {
                                    const rate = hi.exchangeRate || lo.exchangeRate || 195;
                                    issues.push(`단가 변동 — ${lo.unitPriceCny}위안 → ${hi.unitPriceCny}위안으로 ${cnyDiff > 0 ? '상승' : '하락'} (원화 약 ${cnyDiff > 0 ? '+' : ''}${fmt(Math.round(cnyDiff * rate))}원 영향)`);
                                  }
                                  if (lo.shippedQty !== hi.shippedQty) {
                                    issues.push(`수량 차이 — ${lo.shipmentKey}: ${lo.shippedQty}개 vs ${hi.shipmentKey}: ${hi.shippedQty}개 → 수량 적을수록 고정비 배분 증가`);
                                  }
                                  const bigCostDiffs = costDiffs.filter(cd => Math.abs(cd.diff) >= 50).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
                                  if (bigCostDiffs.length > 0) {
                                    const top = bigCostDiffs[0];
                                    issues.push(`${top.label} 차이가 가장 큼 — ${fmt(top.loCost)}원 → ${fmt(top.hiCost)}원 (${top.diff > 0 ? '+' : ''}${fmt(top.diff)}원)`);
                                  }
                                  if (lo.cbmPerUnit && hi.cbmPerUnit && lo.cbmPerUnit !== hi.cbmPerUnit) {
                                    issues.push(`CBM 차이 — ${lo.cbmPerUnit} → ${hi.cbmPerUnit} → CBM 기반 비용 배분에 영향`);
                                  }

                                  // 차이 설명 생성 함수
                                  const descDiff = (loVal, hiVal, unit, key) => {
                                    const d = hiVal - loVal;
                                    if (Math.abs(d) < 1 && loVal === 0 && hiVal === 0) return { text: '—', cls: 'text-gray-400', note: '' };
                                    if (loVal === 0 && hiVal > 0) return { text: `${hi.shipmentKey}만 발생`, cls: 'text-red-500 font-semibold', note: '' };
                                    if (hiVal === 0 && loVal > 0) return { text: `${lo.shipmentKey}만 발생`, cls: 'text-blue-600 font-semibold', note: '' };
                                    if (Math.abs(d) < 1) return { text: '—', cls: 'text-gray-400', note: '' };
                                    const pct = loVal > 0 ? Math.round(Math.abs(d) / loVal * 1000) / 10 : 0;
                                    const arrow = d > 0 ? '▲' : '▼';
                                    const color = d > 0 ? 'text-red-500' : 'text-blue-600';
                                    let note = '';
                                    if (pct > 100) note = '이상치 의심';
                                    else if (pct > 50) note = '큰 차이';
                                    return { text: `${arrow} ${d > 0 ? '+' : ''}${fmt(d)}${unit} (${pct}%)`, cls: `${color} font-semibold`, note };
                                  };

                                  // 내러티브 분석 생성
                                  const narratives = [];
                                  if (Math.abs(cnyDiff) >= 0.5) {
                                    const rate = hi.exchangeRate || lo.exchangeRate || 195;
                                    narratives.push(`단가가 ${lo.unitPriceCny}위안에서 ${hi.unitPriceCny}위안으로 ${cnyDiff > 0 ? '올랐습니다' : '내렸습니다'}. 원화 환산 시 개당 약 ${cnyDiff > 0 ? '+' : ''}${fmt(Math.round(cnyDiff * rate))}원 차이가 발생합니다.`);
                                  }
                                  if (lo.shippedQty !== hi.shippedQty) {
                                    const smaller = lo.shippedQty < hi.shippedQty ? lo : hi;
                                    const bigger = lo.shippedQty < hi.shippedQty ? hi : lo;
                                    narratives.push(`${smaller.shipmentKey}는 ${smaller.shippedQty}개, ${bigger.shipmentKey}는 ${bigger.shippedQty}개로 수량 차이가 있습니다. 수량이 적은 ${smaller.shipmentKey}에서 고정비(해상운임, 통관비 등)가 개당 더 많이 배분됩니다.`);
                                  }
                                  const topCostDiff = [...costDiffs].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
                                  if (topCostDiff && Math.abs(topCostDiff.diff) >= 50) {
                                    narratives.push(`비용 항목 중 ${topCostDiff.label}의 차이가 가장 큽니다. ${fmt(topCostDiff.loCost)}원 → ${fmt(topCostDiff.hiCost)}원으로 개당 ${topCostDiff.diff > 0 ? '+' : ''}${fmt(topCostDiff.diff)}원 차이가 납니다.`);
                                  }
                                  if (lo.cbmPerUnit && hi.cbmPerUnit && Math.abs(hi.cbmPerUnit - lo.cbmPerUnit) / Math.min(lo.cbmPerUnit, hi.cbmPerUnit) > 2) {
                                    const abnormal = lo.cbmPerUnit > hi.cbmPerUnit ? lo : hi;
                                    narratives.push(`${abnormal.shipmentKey}의 CBM(${abnormal.cbmPerUnit})이 비정상적으로 큽니다. 정상치 대비 ${Math.round(Math.max(lo.cbmPerUnit, hi.cbmPerUnit) / Math.min(lo.cbmPerUnit, hi.cbmPerUnit))}배 수준으로, 데이터 오입력 가능성이 있습니다. 확인이 필요합니다.`);
                                  }

                                  return (
                                    <div>
                                      {/* 비교 카드 (선택한 출고건) */}
                                      <div className={`grid gap-4 mb-5 ${selected.length >= 5 ? 'grid-cols-5' : selected.length === 4 ? 'grid-cols-4' : selected.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                        {selected.map((sh, si) => {
                                          const isLo = sh === lo;
                                          const isHi = sh === hi;
                                          const borderColor = isLo ? 'border-blue-200' : isHi ? 'border-red-200' : 'border-gray-200';
                                          const tag = isLo ? '최저' : isHi ? '최고' : '';
                                          const tagColor = isLo ? 'bg-blue-100 text-blue-700' : isHi ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
                                          return (
                                            <div key={si} className={`bg-white rounded-xl border-2 ${borderColor} p-5`}>
                                              <div className="flex items-center justify-between mb-2">
                                                <div>
                                                  <span className={`px-2.5 py-1 ${tagColor} rounded-full text-xs font-bold`}>{sh.shipmentKey}</span>
                                                  <span className="ml-2 text-xs text-gray-400">{tag && `${tag} 원가`}{!tag && '비교'}</span>
                                                {sh.option && <span className="ml-2 text-xs text-gray-500 font-semibold">{sh.option}</span>}
                                                </div>
                                                <p className={`text-xl font-bold ${isHi ? 'text-red-500' : isLo ? 'text-blue-600' : 'text-[#1a2332]'}`}>{fmt(sh.costPerUnit)}원</p>
                                              </div>
                                              <div className="grid grid-cols-3 gap-2 mb-3">
                                                {[
                                                  ['단가', `${sh.unitPriceRaw || sh.unitPriceCny}`],
                                                  ['운임단가', `${sh.chinaShippingPerUnit || (sh.unitPriceCny && sh.unitPriceRaw ? Math.round((sh.unitPriceCny - sh.unitPriceRaw) * 100) / 100 : 0)}`],
                                                  ['출고수량', `${sh.shippedQty}개`],
                                                  ['CBM/개', sh.cbmPerUnit != null ? `${sh.cbmPerUnit}` : '—'],
                                                  ['환율', sh.exchangeRate ? `${sh.exchangeRate}` : '—'],
                                                ].map(([label, val], idx) => {
                                                  // 최고원가 카드에서 최저보다 높은 값은 빨간색
                                                  const loSh = selected[0];
                                                  const getShipping = (s) => s.chinaShippingPerUnit || (s.unitPriceCny && s.unitPriceRaw ? Math.round((s.unitPriceCny - s.unitPriceRaw) * 100) / 100 : 0);
                                                  const vals = [
                                                    [sh.unitPriceRaw || sh.unitPriceCny, loSh.unitPriceRaw || loSh.unitPriceCny],
                                                    [getShipping(sh), getShipping(loSh)],
                                                    [sh.shippedQty, loSh.shippedQty],
                                                    [sh.cbmPerUnit, loSh.cbmPerUnit],
                                                    [sh.exchangeRate, loSh.exchangeRate],
                                                  ];
                                                  const isHigher = isHi && vals[idx] && Number(vals[idx][0]) > Number(vals[idx][1]);
                                                  const isLower = false;
                                                  return (
                                                    <div key={idx} className="text-center">
                                                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                                                      <p className={`text-base font-bold ${isHigher ? 'text-red-500' : isLower ? 'text-blue-600' : 'text-[#1a2332]'}`}>{val}</p>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                              {isHi && <p className="text-center text-red-500 font-bold text-base">▲ +{fmt(totalCostDiff)}원 (+{diffPct}%)</p>}
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* 1. 이유 분석 */}
                                      {(() => {
                                        // 최고원가가 비싼 이유 분석 (금액 차이 큰 순)
                                        const analyses = [];
                                        const rate = hi.exchangeRate || lo.exchangeRate || 195;
                                        const higherCosts = costDiffs.filter(cd => cd.diff > 10).sort((a, b) => b.diff - a.diff);

                                        // 단가가 더 비싼 경우
                                        if (cnyDiff > 0) {
                                          const impact = Math.round(cnyDiff * rate);
                                          analyses.push({
                                            title: '단가 인상',
                                            summary: `${lo.unitPriceCny}위안 → ${hi.unitPriceCny}위안으로 개당 +${fmt(impact)}원 증가`,
                                            impact,
                                            details: [
                                              `${hi.shipmentKey}의 단가가 ${lo.shipmentKey}보다 ${Math.round(cnyDiff * 100) / 100}위안 높음`,
                                              `원화 환산 시 개당 약 +${fmt(impact)}원 상승 요인`,
                                            ]
                                          });
                                        }

                                        // 수량이 적어서 고정비 배분 증가
                                        if (hi.shippedQty < lo.shippedQty) {
                                          analyses.push({
                                            title: '수량 감소 → 고정비 배분 증가',
                                            summary: `${lo.shippedQty}개 → ${hi.shippedQty}개로 ${lo.shippedQty - hi.shippedQty}개 감소`,
                                            impact: 0,
                                            details: [
                                              `수량이 적을수록 해상운임·통관비 등 고정비가 개당 더 많이 배분됨`,
                                              `각 비용 항목 상승의 간접 원인`,
                                            ]
                                          });
                                        }

                                        // CBM이 높아서 해상운임 증가
                                        if (hi.cbmPerUnit && lo.cbmPerUnit && hi.cbmPerUnit > lo.cbmPerUnit) {
                                          const ratio = lo.cbmPerUnit > 0 ? hi.cbmPerUnit / lo.cbmPerUnit : 0;
                                          const oceanHi = hi.costs?.oceanFreight?.perUnit || 0;
                                          const oceanLo = lo.costs?.oceanFreight?.perUnit || 0;
                                          const impact = Math.round(oceanHi - oceanLo);
                                          if (ratio > 2) {
                                            analyses.push({
                                              title: '해상운임 상승 (CBM 이상값 의심)',
                                              summary: `${fmt(oceanLo)}원 → ${fmt(oceanHi)}원으로 개당 +${fmt(impact)}원 증가`,
                                              impact,
                                              details: (() => {
                                                const d = [`${hi.shipmentKey}의 CBM ${hi.cbmPerUnit} vs ${lo.shipmentKey}의 CBM ${lo.cbmPerUnit} → ${Math.round(ratio)}배 차이`];
                                                const hiSizes = hi.boxSizes || [];
                                                const loSizes = lo.boxSizes || [];
                                                const hiBox = hiSizes[0];
                                                const loBox = loSizes[0];
                                                if (hiBox) d.push(`${hi.shipmentKey} 박스 사이즈: ${hiBox.size}cm`);
                                                if (loBox) d.push(`${lo.shipmentKey} 박스 사이즈: ${loBox.size}cm`);
                                                return d;
                                              })(),
                                              warn: true
                                            });
                                          } else if (oceanHi > oceanLo) {
                                            const loBoxes = lo.boxSizes?.length || 0;
                                            const hiBoxes = hi.boxSizes?.length || 0;
                                            const loPerBox = loBoxes > 0 ? Math.round(lo.shippedQty / loBoxes) : 0;
                                            const hiPerBox = hiBoxes > 0 ? Math.round(hi.shippedQty / hiBoxes) : 0;
                                            const loBox = lo.boxSizes?.[0];
                                            const hiBox = hi.boxSizes?.[0];
                                            const cbmDetails = [
                                              `박스 입수량: ${lo.shipmentKey} ${loPerBox || '—'}개 → ${hi.shipmentKey} ${hiPerBox || '—'}개`,
                                              `개당 CBM: ${lo.cbmPerUnit} → ${hi.cbmPerUnit}로 상승`,
                                              `박스 사이즈: ${loBox ? loBox.size + 'cm' : '—'} → ${hiBox ? hiBox.size + 'cm' : '—'}`,
                                            ];
                                            analyses.push({
                                              title: 'CBM 증가 → 해상운임 상승',
                                              summary: `${fmt(oceanLo)}원 → ${fmt(oceanHi)}원으로 개당 +${fmt(impact)}원 상승`,
                                              impact,
                                              details: cbmDetails
                                            });
                                          }
                                        }

                                        // 비용 항목 중 높아진 것 (중복 제외)
                                        const hasCbmIssue = analyses.some(a => a.title.includes('CBM'));
                                        for (const cd of higherCosts) {
                                          if (hasCbmIssue && cd.key === 'oceanFreight') continue;
                                          if (analyses.length >= 5) break;
                                          const details = [];
                                          if (cd.key === 'oceanFreight') {
                                            if (hi.cbmPerUnit && lo.cbmPerUnit && hi.cbmPerUnit !== lo.cbmPerUnit) {
                                              details.push(`개당 CBM: ${lo.cbmPerUnit} → ${hi.cbmPerUnit} (CBM이 클수록 해상운임 배분 증가)`);
                                            }
                                            if (hi.shippedQty < lo.shippedQty) {
                                              details.push(`수량 ${lo.shippedQty}개 → ${hi.shippedQty}개 감소로 고정비 배분 증가`);
                                            }
                                            if (!details.length) details.push(`출고건별 총 해상운임 또는 CBM 비율 차이로 인한 배분 변동`);
                                          } else if (cd.key === 'domesticTransport') {
                                            if (hi.shippedQty < lo.shippedQty) {
                                              details.push(`수량 ${lo.shippedQty}개 → ${hi.shippedQty}개 감소로 내륙운송비 개당 배분 증가`);
                                            }
                                            if (hi.cbmPerUnit && lo.cbmPerUnit && hi.cbmPerUnit > lo.cbmPerUnit) {
                                              details.push(`CBM ${lo.cbmPerUnit} → ${hi.cbmPerUnit} 증가로 배분 비중 상승`);
                                            }
                                            if (!details.length) details.push(`출고건별 총 내륙운송비 또는 수량/CBM 차이로 배분 변동`);
                                          } else if (cd.key === 'vat') {
                                            details.push(`부가세는 (상품원가 + 관세) × 10%로 계산`);
                                            if ((hi.productCostKrw || 0) > (lo.productCostKrw || 0)) {
                                              details.push(`상품원가가 ${fmt(lo.productCostKrw)}원 → ${fmt(hi.productCostKrw)}원으로 올라 부가세도 상승`);
                                            }
                                          } else if (cd.key === 'customsDuty') {
                                            details.push(`관세는 상품원가 × 관세율로 계산`);
                                            if ((hi.productCostKrw || 0) > (lo.productCostKrw || 0)) {
                                              details.push(`상품원가 상승에 따른 관세 증가`);
                                            }
                                          } else if (cd.key === 'purchasingFee') {
                                            details.push(`구매대행 수수료는 총금액의 1%로 계산`);
                                            if (cnyDiff > 0) details.push(`단가 상승으로 총금액 증가 → 수수료 증가`);
                                          } else if (cd.key === 'customsClearanceFee') {
                                            if (hi.shippedQty < lo.shippedQty) {
                                              details.push(`수량 감소로 통관수수료 개당 배분 증가`);
                                            } else {
                                              details.push(`출고건별 통관수수료 차이 또는 수량/CBM 변동`);
                                            }
                                          } else {
                                            details.push(`출고건별 비용 차이 또는 배분 비율 변동`);
                                          }
                                          analyses.push({
                                            title: `${cd.label} 상승`,
                                            summary: `${fmt(cd.loCost)}원 → ${fmt(cd.hiCost)}원으로 개당 +${fmt(cd.diff)}원 증가`,
                                            impact: Math.round(cd.diff),
                                            details
                                          });
                                        }

                                        // 금액 차이 큰 순으로 정렬
                                        analyses.sort((a, b) => (b.impact || 0) - (a.impact || 0));

                                        if (analyses.length === 0) return null;

                                        return (
                                          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                                            <h4 className="text-sm font-bold text-red-600 mb-4">이유 분석</h4>
                                            <div className="space-y-6">
                                              {analyses.map((a, ai) => (
                                                <div key={ai} className={`flex items-start gap-3 text-sm ${a.warn ? 'p-3 bg-orange-50 rounded-lg border border-orange-200' : ''}`}>
                                                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${a.warn ? 'bg-orange-500' : 'bg-[#1a2332]'}`}>{ai + 1}</span>
                                                  <div>
                                                    <p className="font-bold text-[#1a2332] mb-0.5">{a.title}</p>
                                                    <p className="text-red-500 font-semibold mb-1">{a.summary}</p>
                                                    {a.details && a.details.map((d, di) => (
                                                      <p key={di} className="text-[#1a2332] text-sm leading-relaxed">{di + 1}) {d}</p>
                                                    ))}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* 2. 항목별 비교표 */}
                                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
                                        <div className="px-5 py-3 bg-[#f5f6fa] border-b border-gray-200">
                                          <h4 className="text-sm font-bold text-[#1a2332]">항목별 비교표</h4>
                                        </div>
                                        <table className="text-sm w-full">
                                          <thead>
                                            <tr className="border-b border-gray-200 bg-gray-50/50">
                                              <th className="px-4 py-2.5 text-left font-semibold text-gray-500" style={{width:'28%'}}>항목</th>
                                              <th className="px-4 py-2.5 text-right font-semibold text-blue-600" style={{width:'24%'}}>{lo.shipmentKey}</th>
                                              <th className="px-4 py-2.5 text-right font-semibold text-red-500" style={{width:'24%'}}>{hi.shipmentKey}</th>
                                              <th className="px-4 py-2.5 text-right font-semibold text-gray-500 cursor-pointer hover:text-blue-600 select-none" style={{width:'24%'}}
                                                onClick={() => setCompareSort(p => p === null ? 'desc' : p === 'desc' ? 'asc' : null)}>
                                                차이 {compareSort === 'desc' ? '▼' : compareSort === 'asc' ? '▲' : '⇅'}
                                              </th>
                                            </tr>
                                            <tr className="bg-[#f5f6fa] font-bold border-b border-gray-200">
                                              <td className="px-4 py-3 text-[#1a2332]">수입원가 (개당)</td>
                                              <td className="px-4 py-3 text-right text-blue-600">{fmt(lo.costPerUnit)}원</td>
                                              <td className="px-4 py-3 text-right text-red-500">{fmt(hi.costPerUnit)}원</td>
                                              <td className="px-4 py-3 text-right text-red-500 text-xs">▲ +{fmt(totalCostDiff)}원 (+{diffPct}%)</td>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              const rows = [
                                                { label: '단가(CNY)', loVal: lo.unitPriceCny, hiVal: hi.unitPriceCny, unit: '위안', decimal: 2 },
                                                { label: '후불0.7', loVal: lo.postpaidFee || 0.7, hiVal: hi.postpaidFee || 0.7, unit: '', decimal: 1 },
                                                { label: '수수료7%', loVal: lo.commission, hiVal: hi.commission, unit: '위안', decimal: 2 },
                                                { label: '수수료1%', loVal: lo.costs?.purchasingFee?.perUnit, hiVal: hi.costs?.purchasingFee?.perUnit, unit: '원', isCost: true },
                                                { label: '해상운임', loVal: lo.costs?.oceanFreight?.perUnit, hiVal: hi.costs?.oceanFreight?.perUnit, unit: '원', isCost: true },
                                                { label: 'DOC FEE', loVal: lo.costs?.documentFee?.perUnit, hiVal: hi.costs?.documentFee?.perUnit, unit: '원', isCost: true },
                                                { label: '원산지증명서', loVal: lo.costs?.originCertFee?.perUnit, hiVal: hi.costs?.originCertFee?.perUnit, unit: '원', isCost: true },
                                                { label: '통관수수료', loVal: lo.costs?.customsClearanceFee?.perUnit, hiVal: hi.costs?.customsClearanceFee?.perUnit, unit: '원', isCost: true },
                                                { label: '관세', loVal: lo.costs?.customsDuty?.perUnit, hiVal: hi.costs?.customsDuty?.perUnit, unit: '원', isCost: true },
                                                { label: '부가세', loVal: lo.costs?.vat?.perUnit, hiVal: hi.costs?.vat?.perUnit, unit: '원', isCost: true },
                                                { label: '내륙운송료', loVal: lo.costs?.domesticTransport?.perUnit, hiVal: hi.costs?.domesticTransport?.perUnit, unit: '원', isCost: true },
                                              ];
                                              // 차이 정렬
                                              const rowsWithDiff = rows.map(r => ({ ...r, diff: (r.hiVal || 0) - (r.loVal || 0) }));
                                              if (compareSort === 'asc') rowsWithDiff.sort((a, b) => a.diff - b.diff);
                                              else if (compareSort === 'desc') rowsWithDiff.sort((a, b) => b.diff - a.diff);

                                              const fmtNum = (v, decimal) => {
                                                if (v == null) return '—';
                                                return decimal === 0 ? Math.round(v) : Math.round(v * Math.pow(10, decimal)) / Math.pow(10, decimal);
                                              };

                                              return rowsWithDiff.map((r, ri) => {
                                                const lv = r.loVal || 0;
                                                const hv = r.hiVal || 0;
                                                const d = r.isCost ? descDiff(lv, hv, r.unit, r.label) : null;
                                                const diff = r.diff;
                                                const fmtVal = (v) => r.isCost ? `${fmt(v)}${r.unit}` : `${fmtNum(v, r.decimal)}${r.unit}`;
                                                const fmtDiff = (v) => r.isCost ? fmt(Math.abs(v)) : fmtNum(Math.abs(v), r.decimal);
                                                return (
                                                  <tr key={ri} className={`border-b border-gray-50 ${d && d.note ? 'bg-yellow-50/40' : ''}`}>
                                                    <td className="px-4 py-2.5 font-semibold text-gray-700">{r.label}</td>
                                                    <td className="px-4 py-2.5 text-right">{fmtVal(lv)}</td>
                                                    <td className="px-4 py-2.5 text-right">{fmtVal(hv)}</td>
                                                    <td className={`px-4 py-2.5 text-right text-xs ${d ? d.cls : ''}`}>
                                                      {d ? <>{d.text}{d.note && <span className="block text-orange-500 text-[11px]">{d.note}</span>}</>
                                                        : Math.abs(diff) >= 0.01
                                                          ? <span className={`font-semibold ${diff > 0 ? 'text-red-500' : 'text-blue-600'}`}>{diff > 0 ? '▲' : '▼'} {fmtDiff(diff)}{r.unit}</span>
                                                          : <span className="text-gray-400">—</span>}
                                                    </td>
                                                  </tr>
                                                );
                                              });
                                            })()}
                                          </tbody>
                                        </table>
                                      </div>


                                    </div>
                                  );
                                })()}
                              </div>
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
            {filtered.length > displayCount && (
              <div className="py-3 text-center border-t">
                <button onClick={() => setDisplayCount(c => c + 100)}
                  className="px-6 py-2 bg-[#1a2332] text-white rounded-lg text-sm font-semibold hover:bg-[#2a3342]">
                  더보기 ({displayCount}/{filtered.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
