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

export default function ConfirmedCbmPage() {
  const [allData, setAllData] = useState({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setDisplayCount(100); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [displayCount, setDisplayCount] = useState(100);
  const [expandedSku, setExpandedSku] = useState(null);
  const [cbmFilter, setCbmFilter] = useState('all');
  const [confirmedSkus, setConfirmedSkus] = useState(new Set());

  const toggleConfirmSku = useCallback(async (sku) => {
    if (confirmedSkus.has(sku)) return; // 한번 확인완료하면 해제 안 됨
    const res = await fetch('/api/confirmed-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', sku }),
    });
    if (res.ok) setConfirmedSkus(prev => new Set([...prev, sku]));
  }, [confirmedSkus]);

  const toggleExpand = useCallback((sku) => {
    setExpandedSku(prev => prev === sku ? null : sku);
  }, []);

  const [excludedData, setExcludedData] = useState({});
  const excludedKeys = useMemo(() => new Set(Object.entries(excludedData).filter(([, v]) => v.excluded !== false).map(([k]) => k)), [excludedData]);

  useEffect(() => {
    Promise.all([
      fetch('/api/save-all').then(r => r.json()),
      fetch('/api/excluded-rows').then(r => r.json()),
      fetch('/api/confirmed-skus').then(r => r.json()),
    ]).then(([d, ex, cs]) => {
      setAllData(d);
      setExcludedData(typeof ex === 'object' && !Array.isArray(ex) ? ex : {});
      setConfirmedSkus(new Set(Array.isArray(cs) ? cs : []));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleExclude = useCallback(async (items) => {
    const res = await fetch('/api/excluded-rows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exclude', items }),
    });
    if (res.ok) setExcludedData(prev => {
      const next = { ...prev };
      items.forEach(i => {
        const key = `${i.sku}__${i.shipmentKey}`;
        next[key] = { ...next[key], excluded: true, memo: next[key]?.memo || '' };
      });
      return next;
    });
  }, []);

  const handleRestore = useCallback(async (items) => {
    const res = await fetch('/api/excluded-rows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', items }),
    });
    if (res.ok) setExcludedData(prev => {
      const next = { ...prev };
      items.forEach(i => {
        const key = `${i.sku}__${i.shipmentKey}`;
        if (next[key]?.memo) { next[key] = { excluded: false, memo: next[key].memo }; }
        else { delete next[key]; }
      });
      return next;
    });
  }, []);

  const [editingMemo, setEditingMemo] = useState(null); // 'sku__shipmentKey'
  const [memoText, setMemoText] = useState('');

  const openMemo = useCallback((item) => {
    const key = `${item.sku}__${item.shipmentKey}`;
    if (editingMemo === key) { setEditingMemo(null); return; }
    setMemoText(excludedData[key]?.memo || '');
    setEditingMemo(key);
  }, [excludedData, editingMemo]);

  const saveMemo = useCallback(async (item) => {
    const key = `${item.sku}__${item.shipmentKey}`;
    const res = await fetch('/api/excluded-rows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'memo', items: [item], memo: memoText }),
    });
    if (res.ok) {
      setExcludedData(prev => ({ ...prev, [key]: { ...prev[key], memo: memoText } }));
      setEditingMemo(null);
    }
  }, [memoText]);

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  const allRows = useMemo(() => {
    const skuCosts = {};
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (r.sku && r.costPerUnit && !excludedKeys.has(`${r.sku}__${shipmentKey}`)) {
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

    // 출고건별 원본 행
    const rawRows = [];
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        const costX285 = Math.round((r.unitPriceRaw || 0) * 285);
        rawRows.push({ ...r, shipmentKey, costX285, avgCost: skuAvg[r.sku] || 0, costDiff: costX285 - (r.costPerUnit || 0), shipCount: skuShipCount[r.sku]?.size || 0 });
      }
    }

    // SKU별 합산 (제외된 행 빼고 집계, subRows에는 모두 포함)
    const skuMap = {};
    for (const r of rawRows) {
      if (!skuMap[r.sku]) {
        skuMap[r.sku] = {
          sku: r.sku, productName: r.productName, labelName: r.labelName || r.productName,
          shippedQty: 0, shipCount: r.shipCount, avgCost: r.avgCost,
          cbmConfirmed: true, totalCbm: 0,
          totalCostWeighted: 0, totalCnyWeighted: 0, totalUnitPriceRaw: 0,
          costs: {},
          subRows: [],
        };
      }
      const agg = skuMap[r.sku];
      const isExcluded = excludedKeys.has(`${r.sku}__${r.shipmentKey}`);
      r._excluded = isExcluded;
      if (!isExcluded) {
        agg.shippedQty += r.shippedQty;
        agg.totalCbm += (r.cbmPerUnit || 0) * r.shippedQty;
        agg.totalCostWeighted += (r.costPerUnit || 0) * r.shippedQty;
        agg.totalCnyWeighted += (r.unitPriceCny || 0) * r.shippedQty;
        agg.totalUnitPriceRaw += (r.unitPriceRaw || 0) * r.shippedQty;
        if (r.cbmConfirmed === false) agg.cbmConfirmed = false;
        for (const k of ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport']) {
          if (!agg.costs[k]) agg.costs[k] = { total: 0 };
          agg.costs[k].total += (r.costs?.[k]?.perUnit || 0) * r.shippedQty;
        }
      }
      agg.subRows.push(r);
    }

    const rows = Object.values(skuMap).map(agg => {
      const qty = agg.shippedQty || 1;
      const cbmPerUnit = agg.totalCbm / qty;
      const costPerUnit = Math.round(agg.totalCostWeighted / qty);
      const unitPriceCny = Math.round((agg.totalCnyWeighted / qty) * 100) / 100;
      const unitPriceRaw = agg.totalUnitPriceRaw / qty;
      const costX285 = Math.round(unitPriceRaw * 285);
      const costs = {};
      for (const [k, v] of Object.entries(agg.costs)) {
        costs[k] = { total: Math.round(v.total), perUnit: Math.round(v.total / qty) };
      }
      const minCost = Math.min(...agg.subRows.map(r => r.costPerUnit || Infinity));
      const avgVsMin = minCost > 0 && minCost < Infinity ? Math.round((agg.avgCost - minCost) / minCost * 1000) / 10 : 0;
      return {
        sku: agg.sku, productName: agg.productName, labelName: agg.labelName,
        shippedQty: agg.shippedQty, shipCount: agg.shipCount, avgCost: agg.avgCost,
        minCost, avgVsMin,
        cbmPerUnit: Math.round(cbmPerUnit * 10000) / 10000,
        cbmConfirmed: agg.cbmConfirmed,
        costPerUnit, unitPriceCny, costX285,
        costDiff: costX285 - costPerUnit,
        costs, subRows: agg.subRows,
      };
    });
    return rows;
  }, [allData, excludedKeys]);

  const skuGroups = useMemo(() => {
    const groups = {};
    for (const row of allRows) {
      groups[row.sku] = { sku: row.sku, labelName: row.labelName || row.productName, rows: row.subRows || [], shipCount: row.shipCount, avgCost: row.avgCost };
    }
    return groups;
  }, [allRows]);

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

    // CBM 필터 적용 (SKU 합산 행 기준)
    if (cbmFilter === 'confirmed') {
      // 모든 subRows가 확정인 SKU만
      result = result.filter(r => r.cbmConfirmed !== false && (!r.subRows || r.subRows.every(row => row.cbmConfirmed !== false)));
    } else if (cbmFilter === 'semi') {
      // subRows 중 추정이 있지만 확정이 절반 이상인 SKU
      result = result.filter(r => {
        if (!r.subRows || r.subRows.length === 0) return false;
        const confirmedCount = r.subRows.filter(row => row.cbmConfirmed !== false).length;
        const hasEstimated = r.subRows.some(row => row.cbmConfirmed === false);
        return hasEstimated && confirmedCount >= r.subRows.length / 2;
      });
    } else if (cbmFilter === 'estimated') {
      // 모든 subRows가 추정이거나 확정이 절반 미만인 SKU
      result = result.filter(r => {
        if (!r.subRows || r.subRows.length === 0) return r.cbmConfirmed === false;
        const confirmedCount = r.subRows.filter(row => row.cbmConfirmed !== false).length;
        const hasEstimated = r.subRows.some(row => row.cbmConfirmed === false);
        return hasEstimated && confirmedCount < r.subRows.length / 2 || r.subRows.every(row => row.cbmConfirmed === false);
      });
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
  }, [allRows, debouncedSearch, searched, sortKey, sortDir, cbmFilter, skuGroups]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';
  const th = (bg) => `px-3 py-2 font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none hover:text-blue-600 text-center ${bg}`;

  const columns = [
    { key: 'sku', label: 'SKU', bg: 'sticky left-0 bg-gray-50 z-10', width: '150px' },
    { key: 'productName', label: '상품명', width: '200px' },
    { key: 'cbmPerUnit', label: '개별CBM', width: '80px' },
    { key: 'shipCount', label: '출고횟수', width: '70px' },
    { key: 'shippedQty', label: '총수량', width: '70px' },
    { key: 'unitPriceCny', label: '단가(CNY)', bg: 'bg-pink-100', width: '80px' },
    { key: 'costPerUnit', label: '원가(개당)', bg: 'bg-blue-50', width: '90px' },
    { key: 'avgCost', label: '가중평균원가', bg: 'bg-purple-50', width: '100px' },
    { key: 'avgVsMin', label: '최소대비', bg: 'bg-purple-50', width: '80px' },
    { key: 'costX285', label: '원가(x285)', bg: 'bg-amber-100', width: '90px' },
    { key: 'costDiff', label: '차이', width: '80px' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">확정CBM 원가</h1>
        <p className="text-sm text-gray-500 mt-1">CBM 확정 데이터만 표시 — {Object.keys(allData).length}건 출고 / {allRows.length}개 항목</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-2xl mx-auto">
        <div className="flex gap-3">
          <input type="text" placeholder="SKU, 상품명, 출고코드 검색..." value={search}
            onChange={e => { setSearch(e.target.value); setSearched(false); }}
            onKeyDown={e => { if (e.key === 'Enter') setSearched(true); }}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <button onClick={() => setSearched(true)} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700">조회</button>
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

      {!loading && filtered.length > 0 && (
        <div className="mb-3">
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const filterName = { all: '전체', confirmed: 'CBM확정', semi: 'CBM준확정', estimated: 'CBM추정' }[cbmFilter] || '전체';
            const headers = ['SKU','상품명','개별CBM','출고횟수','총수량','단가(CNY)','원가(개당)','가중평균원가','원가(x285)','차이',...costLabels];
            const wsData = [headers, ...filtered.map(r => [
              r.sku, r.labelName || r.productName, r.cbmPerUnit || 0, r.shipCount, r.shippedQty, r.unitPriceCny,
              r.costPerUnit, r.avgCost, r.costX285, r.costDiff,
              ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
            ])];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:20},{wch:40},{wch:10},{wch:8},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:10},...costKeys.map(() => ({wch:10}))];
            XLSX.utils.book_append_sheet(wb, ws, filterName);
            XLSX.writeFile(wb, `확정CBM원가_${filterName}_${new Date().toISOString().slice(0,10)}.xlsx`);
          }} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
            EXCEL 다운 ({filtered.length}건)
          </button>
        </div>
      )}

      {loading ? <p className="text-gray-500 text-center py-10">로딩중...</p> : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">{searched ? '검색 결과 없음' : '저장된 데이터 없음'}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th('') + ' w-10'}></th>
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
                    <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors">
                      <td className="px-3 py-2.5 text-center text-gray-400" onClick={() => toggleExpand(expandedSku)}>▲</td>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {confirmedSkus.has(expandedSku) ? (
                          <span className="text-[10px] font-bold text-green-600 whitespace-nowrap">확인완료</span>
                        ) : (
                          <input type="checkbox" checked={false} onChange={() => toggleConfirmSku(expandedSku)} className="w-4 h-4 cursor-pointer accent-blue-600" />
                        )}
                      </td>
                      <td colSpan={999} className="px-3 py-2.5 font-bold text-sm" onClick={() => toggleExpand(expandedSku)}>
                        {expandedSku} — {skuGroups[expandedSku]?.labelName} ({skuGroups[expandedSku]?.rows.length}건)
                      </td>
                    </tr>
                    <tr className="h-0"><td colSpan={999} className="p-0 border-t-2 border-blue-300"></td></tr>
                    {skuGroups[expandedSku]?.rows.map((sub, j) => (
                    <React.Fragment key={j}>
                      <tr className={`${j % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} ${sub._excluded ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {(() => {
                            const key = `${sub.sku}__${sub.shipmentKey}`;
                            const hasMemo = excludedData[key]?.memo;
                            return (
                              <span className="inline-flex gap-1">
                                {sub._excluded ? (
                                  <button onClick={() => handleRestore([{ sku: sub.sku, shipmentKey: sub.shipmentKey }])}
                                    className="px-2 py-0.5 bg-blue-500 text-white text-[10px] rounded font-bold hover:bg-blue-600">복원</button>
                                ) : (
                                  <button onClick={() => handleExclude([{ sku: sub.sku, shipmentKey: sub.shipmentKey }])}
                                    className="px-2 py-0.5 bg-red-500 text-white text-[10px] rounded font-bold hover:bg-red-600">제외</button>
                                )}
                                <button onClick={() => openMemo({ sku: sub.sku, shipmentKey: sub.shipmentKey })}
                                  className={`px-2 py-0.5 text-[10px] rounded font-bold ${hasMemo ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                                  {hasMemo ? '메모' : '+메모'}
                                </button>
                              </span>
                            );
                          })()}
                        </td>
                        <td className={`px-3 py-2 font-mono text-xs text-center whitespace-nowrap sticky left-0 z-10 ${j % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} ${sub._excluded ? 'line-through' : ''}`}>{sub.shipmentKey}</td>
                        <td className="px-3 py-2 text-xs text-left" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{sub.labelName || sub.productName}</td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold ${sub.cbmConfirmed === false ? 'text-red-500' : ''}`}>{sub.cbmPerUnit ? sub.cbmPerUnit.toFixed(4) : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold">{sub.shipCount}회</td>
                        <td className="px-3 py-2 text-center">{sub.shippedQty}</td>
                        <td className="px-3 py-2 text-center font-bold">{sub.unitPriceCny}</td>
                        <td className="px-3 py-2 text-center font-bold text-blue-700">{formatNum(sub.costPerUnit)}원</td>
                        <td className="px-3 py-2 text-center font-bold text-purple-700">{sub.avgCost ? formatNum(sub.avgCost) + '원' : '-'}</td>
                        <td className="px-3 py-2 text-center text-gray-400">-</td>
                        <td className="px-3 py-2 text-center font-bold">{formatNum(sub.costX285)}원</td>
                        <td className={`px-3 py-2 text-center font-bold ${sub.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{sub.costDiff >= 0 ? '+' : ''}{formatNum(sub.costDiff)}원</td>
                        {costKeys.map(k => <td key={k} className="px-3 py-2 text-center">{formatNum(sub.costs?.[k]?.perUnit)}원</td>)}
                      </tr>
                      {editingMemo === `${sub.sku}__${sub.shipmentKey}` && (
                        <tr className="bg-yellow-50">
                          <td colSpan={999} className="px-4 py-2">
                            <div className="flex gap-2 items-start max-w-xl">
                              <textarea value={memoText} onChange={e => setMemoText(e.target.value)}
                                placeholder="메모를 입력하세요..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y min-h-[60px]"
                                rows={3} autoFocus />
                              <div className="flex flex-col gap-1">
                                <button onClick={() => saveMemo({ sku: sub.sku, shipmentKey: sub.shipmentKey })}
                                  className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg font-bold hover:bg-orange-600">저장</button>
                                <button onClick={() => setEditingMemo(null)}
                                  className="px-3 py-1.5 bg-gray-300 text-gray-700 text-xs rounded-lg font-bold hover:bg-gray-400">취소</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    ))}
                  </>
                ) : (
                  filtered.slice(0, displayCount).map((row, i) => {
                    const group = skuGroups[row.sku];
                    const hasMultiple = group && group.rows.length > 1;
                    return (
                      <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${hasMultiple ? 'cursor-pointer hover:bg-blue-50/30 transition-colors' : ''}`} onClick={() => hasMultiple && toggleExpand(row.sku)}>
                        <td className="px-3 py-2.5 text-center text-gray-400">{hasMultiple ? '▼' : ''}</td>
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          {confirmedSkus.has(row.sku) ? (
                            <span className="text-[10px] font-bold text-green-600 whitespace-nowrap">확인완료</span>
                          ) : (
                            <input type="checkbox" checked={false} onChange={() => toggleConfirmSku(row.sku)} className="w-4 h-4 cursor-pointer accent-blue-600" />
                          )}
                        </td>
                        <td className={`px-3 py-2 font-mono text-xs text-center whitespace-nowrap sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row.sku}</td>
                        <td className="px-3 py-2 text-xs text-left" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{row.labelName || row.productName}</td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold ${row.cbmConfirmed === false ? 'text-red-500' : ''}`}>{row.cbmPerUnit ? row.cbmPerUnit.toFixed(4) : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold">{row.shipCount}회</td>
                        <td className="px-3 py-2 text-center">{row.shippedQty}</td>
                        <td className="px-3 py-2 text-center font-bold">{row.unitPriceCny}</td>
                        <td className="px-3 py-2 text-center font-bold text-blue-700">{formatNum(row.costPerUnit)}원</td>
                        <td className="px-3 py-2 text-center font-bold text-purple-700">{row.avgCost ? formatNum(row.avgCost) + '원' : '-'}</td>
                        <td className={`px-3 py-2 text-center font-bold ${row.avgVsMin > 0 ? 'text-red-600' : row.avgVsMin < 0 ? 'text-blue-600' : ''}`}>{row.avgVsMin > 0 ? '+' : ''}{row.avgVsMin}%</td>
                        <td className="px-3 py-2 text-center font-bold">{formatNum(row.costX285)}원</td>
                        <td className={`px-3 py-2 text-center font-bold ${row.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{row.costDiff >= 0 ? '+' : ''}{formatNum(row.costDiff)}원</td>
                        {costKeys.map(k => <td key={k} className="px-3 py-2 text-center">{formatNum(row.costs?.[k]?.perUnit)}원</td>)}
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
