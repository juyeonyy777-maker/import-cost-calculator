'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function formatNum(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

function RTh({ children, className = '', style = {}, minWidth = 50, initialWidth, ...props }) {
  const ref = useRef(null);
  const sx = useRef(0), sw = useRef(0);
  const onDown = useCallback(e => {
    e.preventDefault(); e.stopPropagation();
    sx.current = e.clientX; sw.current = ref.current.offsetWidth;
    const move = e2 => { ref.current.style.width = Math.max(minWidth, sw.current + e2.clientX - sx.current) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }, [minWidth]);
  const s = { ...style, position: 'relative' };
  if (initialWidth) { s.width = initialWidth; }
  return (
    <th ref={ref} className={className} style={s} {...props}>
      {children}
      <div onMouseDown={onDown} style={{ position:'absolute', right:0, top:0, bottom:0, width:'6px', cursor:'col-resize', userSelect:'none', background:'#cbd5e1', borderRadius:'2px' }}
        onMouseOver={e => { e.currentTarget.style.background = '#94a3b8'; }} onMouseOut={e => { e.currentTarget.style.background = '#cbd5e1'; }} />
    </th>
  );
}

export default function DataPage() {
  const [allData, setAllData] = useState({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searched, setSearched] = useState(false);

  // 디바운스: 타이핑 후 200ms 뒤에 실제 검색
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setDisplayCount(100); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [displayCount, setDisplayCount] = useState(100);
  const [expandedSku, setExpandedSku] = useState(null);
  const [cbmFilter, setCbmFilter] = useState('all'); // 'all' | 'confirmed' | 'estimated'

  const toggleExpand = useCallback((sku) => {
    setExpandedSku(prev => prev === sku ? null : sku);
  }, []);

  useEffect(() => {
    fetch('/api/save-all').then(r => r.json()).then(d => { setAllData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  // 전체 행 (useMemo로 allData 변경 시에만 재계산)
  const allRows = useMemo(() => {
    const skuCosts = {};
    for (const entry of Object.values(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (r.sku && r.costPerUnit) {
          if (!skuCosts[r.sku]) skuCosts[r.sku] = [];
          skuCosts[r.sku].push({ cost: r.costPerUnit, qty: r.shippedQty });
        }
      }
    }
    const skuAvg = {};
    for (const [sku, costs] of Object.entries(skuCosts)) {
      const totalCost = costs.reduce((s, c) => s + c.cost * c.qty, 0);
      const totalQty = costs.reduce((s, c) => s + c.qty, 0);
      skuAvg[sku] = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;
    }

    const skuShipCount = {};
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (!r.sku) continue;
        if (!skuShipCount[r.sku]) skuShipCount[r.sku] = new Set();
        skuShipCount[r.sku].add(shipmentKey);
      }
    }

    const rows = [];
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        const costX285 = Math.round((r.unitPriceRaw || 0) * 285);
        rows.push({ ...r, shipmentKey, costX285, avgCost: skuAvg[r.sku] || 0, costDiff: costX285 - (r.costPerUnit || 0), shipCount: skuShipCount[r.sku]?.size || 0 });
      }
    }
    return rows;
  }, [allData]);

  // SKU별 그룹핑
  const skuGroups = useMemo(() => {
    const groups = {};
    for (const row of allRows) {
      if (!groups[row.sku]) groups[row.sku] = { sku: row.sku, labelName: row.labelName || row.productName, rows: [], shipCount: row.shipCount, avgCost: row.avgCost };
      groups[row.sku].rows.push(row);
    }
    return groups;
  }, [allRows]);

  // 검색 + 정렬 (useMemo로 캐싱)
  const filtered = useMemo(() => {
    let result = allRows;
    const q = debouncedSearch.trim().toLowerCase();
    if (searched && q) {
      const kws = q.split(/\s+/);
      result = allRows.filter(r => {
        const text = ((r.sku || '') + ' ' + (r.labelName || '') + ' ' + (r.productName || '') + ' ' + (r.shipmentKey || '')).toLowerCase();
        return kws.every(kw => text.includes(kw));
      });
    }

    // CBM 필터 적용
    if (cbmFilter === 'confirmed') {
      // 검은색만: 해당 SKU 그룹 전체가 확정인 행만
      result = result.filter(r => {
        const group = skuGroups[r.sku];
        return r.cbmConfirmed !== false && (!group || group.rows.every(row => row.cbmConfirmed !== false));
      });
    } else if (cbmFilter === 'semi') {
      // 준확정: SKU 그룹 내 빨간색이 있지만 검은색이 절반 이상
      result = result.filter(r => {
        const group = skuGroups[r.sku];
        if (!group) return false;
        const confirmedCount = group.rows.filter(row => row.cbmConfirmed !== false).length;
        const hasEstimated = group.rows.some(row => row.cbmConfirmed === false);
        return hasEstimated && confirmedCount >= group.rows.length / 2;
      });
    } else if (cbmFilter === 'estimated') {
      // 빨간색만: cbmConfirmed === false인 행만
      result = result.filter(r => r.cbmConfirmed === false);
    }

    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        let va, vb;
        if (sortKey.startsWith('cost_')) {
          const ck = sortKey.replace('cost_', '');
          va = a.costs?.[ck]?.perUnit || 0;
          vb = b.costs?.[ck]?.perUnit || 0;
        } else {
          va = a[sortKey]; vb = b[sortKey];
        }
        if (typeof va === 'string') {
          const c = (va || '').localeCompare(vb || '', 'ko');
          return sortDir === 'asc' ? c : -c;
        }
      return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
      });
    }

    return result;
  }, [allRows, debouncedSearch, searched, sortKey, sortDir, cbmFilter]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';
  const th = (bg) => `px-3 py-2 font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none hover:text-blue-600 text-center ${bg}`;

  const columns = [
    { key: 'shipmentKey', label: '출고', bg: 'sticky left-0 bg-gray-50 z-10', width: '150px' },
    { key: 'sku', label: 'SKU', width: '120px' },
    { key: 'cbmPerUnit', label: '개별CBM', width: '80px' },
    { key: 'shipCount', label: '출고횟수', width: '70px' },
    { key: 'productName', label: '상품명', width: '200px' },
    { key: 'shippedQty', label: '수량', width: '60px' },
    { key: 'unitPriceCny', label: '단가(CNY)', bg: 'bg-pink-100', width: '80px' },
    { key: 'costPerUnit', label: '원가(개당)', bg: 'bg-blue-50', width: '90px' },
    { key: 'avgCost', label: '가중평균원가', bg: 'bg-purple-50', width: '90px' },
    { key: 'costX285', label: '원가(x285)', bg: 'bg-amber-100', width: '90px' },
    { key: 'costDiff', label: '차이', width: '80px' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">전체 데이터</h1>
        <p className="text-sm text-gray-500 mt-1">{Object.keys(allData).length}건 출고 / {allRows.length}개 SKU</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-2xl mx-auto">
        <div className="flex gap-3">
          <input type="text" placeholder="SKU, 상품명, 출고코드 검색..." value={search}
            onChange={e => { setSearch(e.target.value); setSearched(false); }}
            onKeyDown={e => { if (e.key === 'Enter') setSearched(true); }}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <button onClick={() => setSearched(true)} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700">조회</button>
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const headers = ['출고','SKU','개별CBM','출고횟수','품명','수량','단가(CNY)','원가(개당)','평균원가','원가(x285)','차이',...costLabels];
            const wsData = [headers, ...filtered.map(r => [
              r.shipmentKey, r.sku, r.cbmPerUnit || 0, r.shipCount, r.productName, r.shippedQty, r.unitPriceCny,
              r.costPerUnit, r.avgCost, r.costX285, r.costDiff,
              ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
            ])];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:18},{wch:20},{wch:40},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:10},...costKeys.map(() => ({wch:10}))];
            XLSX.utils.book_append_sheet(wb, ws, '데이터');
            XLSX.writeFile(wb, `전체데이터_${new Date().toISOString().slice(0,10)}.xlsx`);
          }} className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 whitespace-nowrap">EXCEL 다운</button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-200">
          <span className="text-sm font-bold text-gray-700">개별CBM 필터:</span>
          {[
            { key: 'all', label: '전체', color: '', activeBg: 'bg-blue-600 border-blue-600' },
            { key: 'confirmed', label: 'CBM 확정', color: 'text-gray-900', activeBg: 'bg-gray-800 border-gray-800' },
            { key: 'semi', label: 'CBM 준확정', color: 'text-amber-500', activeBg: 'bg-amber-500 border-amber-500' },
            { key: 'estimated', label: 'CBM 추정', color: 'text-red-500', activeBg: 'bg-red-500 border-red-500' },
          ].map(opt => (
            <button key={opt.key} onClick={() => { setCbmFilter(opt.key); setDisplayCount(100); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                cbmFilter === opt.key
                  ? opt.activeBg + ' text-white'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {opt.color && <span className={`${cbmFilter === opt.key ? 'text-white' : opt.color} mr-1`}>●</span>}
              {opt.label}
            </button>
          ))}
          {cbmFilter !== 'all' && <span className="text-sm font-bold text-blue-600 ml-2">{filtered.length}건</span>}
        </div>
      </div>

      {loading ? <p className="text-gray-500 text-center py-10">로딩중...</p> : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">{searched ? '검색 결과 없음' : '저장된 데이터 없음'}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th('') + ' w-10'}></th>
                  {columns.map(c => (
                    <RTh key={c.key} className={th(c.bg || '')} initialWidth={c.width} onClick={() => handleSort(c.key)}>{c.label}{sortIcon(c.key)}</RTh>
                  ))}
                  {costKeys.map((k, i) => (
                    <RTh key={k} className={th('bg-sky-50')} initialWidth="80px" onClick={() => handleSort('cost_' + k)}>{costLabels[i]}{sortIcon('cost_' + k)}</RTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expandedSku ? (
                  <>
                    <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleExpand(expandedSku)}>
                      <td className="px-3 py-2.5 text-center text-gray-400">▲</td>
                      <td colSpan={999} className="px-3 py-2.5 font-bold text-sm">
                        {expandedSku} — {skuGroups[expandedSku]?.labelName} ({skuGroups[expandedSku]?.rows.length}건)
                      </td>
                    </tr>
                    <tr className="h-0"><td colSpan={999} className="p-0 border-t-2 border-blue-300"></td></tr>
                    {skuGroups[expandedSku]?.rows.map((sub, j) => (
                      <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                        <td className="px-3 py-2"></td>
                        <td className={`px-3 py-2 font-bold text-xs whitespace-nowrap sticky left-0 z-10 ${j % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>{sub.shipmentKey}</td>
                        <td className="px-3 py-2 font-mono text-xs text-center">{sub.sku}</td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${sub.cbmConfirmed === false ? 'text-red-500' : ''}`}>{sub.cbmPerUnit ? sub.cbmPerUnit.toFixed(4) : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold">{sub.shipCount}회</td>
                        <td className="px-3 py-2 text-xs" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{sub.labelName || sub.productName}</td>
                        <td className="px-3 py-2 text-right">{sub.shippedQty}</td>
                        <td className="px-3 py-2 text-right font-bold">{sub.unitPriceCny}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{formatNum(sub.costPerUnit)}원</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{sub.avgCost ? formatNum(sub.avgCost) + '원' : '-'}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatNum(sub.costX285)}원</td>
                        <td className={`px-3 py-2 text-right font-bold ${sub.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{sub.costDiff >= 0 ? '+' : ''}{formatNum(sub.costDiff)}원</td>
                        {costKeys.map(k => <td key={k} className="px-3 py-2 text-right">{formatNum(sub.costs?.[k]?.perUnit)}원</td>)}
                      </tr>
                    ))}
                  </>
                ) : (
                  filtered.slice(0, displayCount).map((row, i) => {
                    const group = skuGroups[row.sku];
                    const hasMultiple = group && group.rows.length > 1;
                    return (
                      <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${hasMultiple ? 'cursor-pointer hover:bg-blue-50/30 transition-colors' : ''}`} onClick={() => hasMultiple && toggleExpand(row.sku)}>
                        <td className="px-3 py-2.5 text-center text-gray-400">{hasMultiple ? '▼' : ''}</td>
                        <td className={`px-3 py-2 font-bold text-xs whitespace-nowrap sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row.shipmentKey}</td>
                        <td className="px-3 py-2 font-mono text-xs text-center">{row.sku}</td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${group && group.rows.some(r => r.cbmConfirmed === false) ? 'text-red-500' : ''}`}>{row.cbmPerUnit ? row.cbmPerUnit.toFixed(4) : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold">{row.shipCount}회</td>
                        <td className="px-3 py-2 text-xs" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{row.labelName || row.productName}</td>
                        <td className="px-3 py-2 text-right">{row.shippedQty}</td>
                        <td className="px-3 py-2 text-right font-bold">{row.unitPriceCny}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{formatNum(row.costPerUnit)}원</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{row.avgCost ? formatNum(row.avgCost) + '원' : '-'}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatNum(row.costX285)}원</td>
                        <td className={`px-3 py-2 text-right font-bold ${row.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{row.costDiff >= 0 ? '+' : ''}{formatNum(row.costDiff)}원</td>
                        {costKeys.map(k => <td key={k} className="px-3 py-2 text-right">{formatNum(row.costs?.[k]?.perUnit)}원</td>)}
                      </tr>
                    );
                  })
                )}
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
  );
}
