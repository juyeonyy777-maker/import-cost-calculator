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
  const [confirmFilter, setConfirmFilter] = useState('all'); // 'all' | 'confirmed' | 'unconfirmed'
  const [confirmedSkus, setConfirmedSkus] = useState(new Set());
  const [compareSort, setCompareSort] = useState(null);
  const [shipDateSort, setShipDateSort] = useState(null);
  const [shipCostSort, setShipCostSort] = useState(null);
  const [costInputSku, setCostInputSku] = useState(null);
  const [costInputVal, setCostInputVal] = useState('');
  const [selectedShipments, setSelectedShipments] = useState({});
  const [shipFilter, setShipFilter] = useState('');
  const [ccConfirmed, setCcConfirmed] = useState({});
  const [ccMemos, setCcMemos] = useState({});
  const [ccReasons, setCcReasons] = useState({});
  const [recommendedSkus, setRecommendedSkus] = useState(new Set());
  const [showRecommend, setShowRecommend] = useState(false);

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
    setShipFilter('');
  }, []);

  const [excludedData, setExcludedData] = useState({});
  const excludedKeys = useMemo(() => new Set(Object.entries(excludedData).filter(([, v]) => v.excluded !== false).map(([k]) => k)), [excludedData]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('costcheck_confirmed');
      if (saved) setCcConfirmed(JSON.parse(saved));
      const savedMemos = localStorage.getItem('costcheck_memos');
      if (savedMemos) setCcMemos(JSON.parse(savedMemos));
      const savedReasons = localStorage.getItem('costcheck_reasons');
      if (savedReasons) setCcReasons(JSON.parse(savedReasons));
    } catch {}
  }, []);

  const updateCcMemo = useCallback((key, text) => {
    setCcMemos(prev => {
      const next = { ...prev, [key]: text };
      localStorage.setItem('costcheck_memos', JSON.stringify(next));
      return next;
    });
  }, []);

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
      const activeSubs = agg.subRows.filter(r => !r._excluded);
      const maxCost = activeSubs.length > 0 ? Math.max(...activeSubs.map(r => r.costPerUnit || 0)) : 0;
      const costRange = (maxCost && minCost < Infinity) ? maxCost - minCost : 0;
      return {
        sku: agg.sku, productName: agg.productName, labelName: agg.labelName,
        shippedQty: agg.shippedQty, shipCount: agg.shipCount, avgCost: agg.avgCost,
        minCost, avgVsMin, costRange,
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

    // 확인완료 필터
    if (confirmFilter === 'confirmed') {
      result = result.filter(r => confirmedSkus.has(r.sku));
    } else if (confirmFilter === 'unconfirmed') {
      result = result.filter(r => !confirmedSkus.has(r.sku));
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
  }, [allRows, debouncedSearch, searched, sortKey, sortDir, cbmFilter, confirmFilter, confirmedSkus, skuGroups]);

  // 검색 적용 후 기준 데이터 (CBM 필터, 확인완료 필터 적용 전)
  const searchedRows = useMemo(() => {
    let result = allRows;
    const q = debouncedSearch.trim().toLowerCase();
    if (searched && q) {
      const kws = q.split(/\s+/);
      result = result.filter(r => {
        const text = ((r.sku || '') + ' ' + (r.labelName || '') + ' ' + (r.productName || '') + ' ' + (r.shipmentKey || '')).toLowerCase();
        return kws.every(kw => text.includes(kw));
      });
    }
    return result;
  }, [allRows, debouncedSearch, searched]);

  // 개별CBM 필터별 건수
  const cbmCounts = useMemo(() => {
    const isCbmConfirmed = r => r.cbmConfirmed !== false && (!r.subRows || r.subRows.every(row => row.cbmConfirmed !== false));
    const isCbmSemi = r => {
      if (!r.subRows || r.subRows.length === 0) return false;
      const cc = r.subRows.filter(row => row.cbmConfirmed !== false).length;
      const hasEst = r.subRows.some(row => row.cbmConfirmed === false);
      return hasEst && cc >= r.subRows.length / 2;
    };
    const isCbmEstimated = r => {
      if (!r.subRows || r.subRows.length === 0) return r.cbmConfirmed === false;
      const cc = r.subRows.filter(row => row.cbmConfirmed !== false).length;
      const hasEst = r.subRows.some(row => row.cbmConfirmed === false);
      return hasEst && cc < r.subRows.length / 2 || r.subRows.every(row => row.cbmConfirmed === false);
    };
    return {
      all: searchedRows.length,
      confirmed: searchedRows.filter(isCbmConfirmed).length,
      semi: searchedRows.filter(isCbmSemi).length,
      estimated: searchedRows.filter(isCbmEstimated).length,
    };
  }, [searchedRows]);

  // 확인완료 필터별 건수 (CBM 필터 적용 후)
  const confirmCounts = useMemo(() => {
    let cbmFiltered = searchedRows;
    if (cbmFilter === 'confirmed') {
      cbmFiltered = cbmFiltered.filter(r => r.cbmConfirmed !== false && (!r.subRows || r.subRows.every(row => row.cbmConfirmed !== false)));
    } else if (cbmFilter === 'semi') {
      cbmFiltered = cbmFiltered.filter(r => {
        if (!r.subRows || r.subRows.length === 0) return false;
        const cc = r.subRows.filter(row => row.cbmConfirmed !== false).length;
        const hasEst = r.subRows.some(row => row.cbmConfirmed === false);
        return hasEst && cc >= r.subRows.length / 2;
      });
    } else if (cbmFilter === 'estimated') {
      cbmFiltered = cbmFiltered.filter(r => {
        if (!r.subRows || r.subRows.length === 0) return r.cbmConfirmed === false;
        const cc = r.subRows.filter(row => row.cbmConfirmed !== false).length;
        const hasEst = r.subRows.some(row => row.cbmConfirmed === false);
        return hasEst && cc < r.subRows.length / 2 || r.subRows.every(row => row.cbmConfirmed === false);
      });
    }
    const allCount = cbmFiltered.length;
    const confirmedCount = cbmFiltered.filter(r => confirmedSkus.has(r.sku)).length;
    return { all: allCount, confirmed: confirmedCount, unconfirmed: allCount - confirmedCount };
  }, [searchedRows, cbmFilter, confirmedSkus]);

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
    { key: 'costRange', label: '원가편차', bg: 'bg-purple-50', width: '90px' },
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
          <span className="text-sm font-bold text-blue-600 ml-2">{cbmCounts[cbmFilter]}건</span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-gray-200">
          <span className="text-sm font-bold text-gray-700">확인완료 필터:</span>
          {[
            { key: 'all', label: '전체', activeBg: 'bg-blue-600 border-blue-600' },
            { key: 'confirmed', label: '확인완료', activeBg: 'bg-green-600 border-green-600' },
            { key: 'unconfirmed', label: '미확인', activeBg: 'bg-gray-600 border-gray-600' },
          ].map(opt => (
            <button key={opt.key} onClick={() => { setConfirmFilter(opt.key); setDisplayCount(100); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                confirmFilter === opt.key
                  ? opt.activeBg + ' text-white'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {opt.key === 'confirmed' && <span className={`${confirmFilter === opt.key ? 'text-white' : 'text-green-600'} mr-1`}>✓</span>}
              {opt.label}
            </button>
          ))}
          <span className="text-sm font-bold text-blue-600 ml-2">{confirmCounts[confirmFilter]}건</span>
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="mb-3">
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const filterName = { all: '전체', confirmed: 'CBM확정', semi: 'CBM준확정', estimated: 'CBM추정' }[cbmFilter] || '전체';
            const headers = ['확인완료','SKU','상품명','개별CBM','출고횟수','총수량','단가(CNY)','원가(개당)','가중평균원가','최소대비(%)','원가편차','원가(x285)','차이',...costLabels];
            const wsData = [headers, ...filtered.map(r => [
              confirmedSkus.has(r.sku) ? '확인완료' : '', r.sku, r.labelName || r.productName, r.cbmPerUnit || 0, r.shipCount, r.shippedQty, r.unitPriceCny,
              r.costPerUnit, r.avgCost, r.avgVsMin, r.costRange, r.costX285, r.costDiff,
              ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
            ])];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:10},{wch:20},{wch:40},{wch:10},{wch:8},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:10},...costKeys.map(() => ({wch:10}))];
            XLSX.utils.book_append_sheet(wb, ws, filterName);
            XLSX.writeFile(wb, `확정CBM원가_${filterName}_${new Date().toISOString().slice(0,10)}.xlsx`);
          }} className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
            EXCEL 다운 ({filtered.length}건)
          </button>
          <button onClick={() => {
            const candidates = filtered.filter(r => !confirmedSkus.has(r.sku) && r.shipCount >= 2 && r.costRange <= 300 && r.cbmConfirmed !== false);
            if (candidates.length === 0) { alert('조건에 맞는 SKU가 없습니다.'); return; }
            setRecommendedSkus(new Set(candidates.map(r => r.sku)));
            setShowRecommend(true);
          }} className="group relative px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 ml-2">
            자동추천 확인완료
            <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 top-full mt-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-black whitespace-nowrap shadow-lg z-50">
              출고 2회 이상 + 원가편차 300원 이하
            </span>
          </button>
          {showRecommend && recommendedSkus.size > 0 && (
            <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-yellow-800">추천 조건: 출고 2회 이상 + 원가편차 300원 이하 + 미확인</span>
                  <span className="text-sm font-bold text-purple-600 ml-3">{recommendedSkus.size}건 선택됨</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const skus = [...recommendedSkus];
                    const res = await fetch('/api/confirmed-skus', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'confirm-bulk', skus }),
                    });
                    if (res.ok) {
                      setConfirmedSkus(prev => new Set([...prev, ...skus]));
                      setRecommendedSkus(new Set());
                      setShowRecommend(false);
                    }
                  }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700">
                    일괄 확인완료 ({recommendedSkus.size}건)
                  </button>
                  <button onClick={() => { setRecommendedSkus(new Set()); setShowRecommend(false); }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-400">취소</button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="text-sm">
                  <tbody>
                    {filtered.filter(r => recommendedSkus.has(r.sku)).map(r => (
                      <tr key={r.sku} className="hover:bg-yellow-100 cursor-pointer" onClick={() => setRecommendedSkus(prev => {
                        const next = new Set(prev);
                        if (next.has(r.sku)) next.delete(r.sku); else next.add(r.sku);
                        return next;
                      })}>
                        <td className="px-2 py-2"><input type="checkbox" checked={recommendedSkus.has(r.sku)} readOnly className="w-4 h-4 accent-purple-600" /></td>
                        <td className="px-2 py-2 font-mono font-bold whitespace-nowrap">{r.sku}</td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{r.labelName || r.productName}</td>
                        <td className="px-2 py-2 whitespace-nowrap">출고 {r.shipCount}회</td>
                        <td className="px-2 py-2 whitespace-nowrap">편차 {formatNum(r.costRange)}원</td>
                        <td className="px-2 py-2 whitespace-nowrap font-bold">원가 {formatNum(r.costPerUnit)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                    <tr className="bg-gray-100">
                      <td className="px-3 py-2.5 text-center text-gray-400 cursor-pointer hover:text-blue-600" onClick={() => toggleExpand(expandedSku)}>▲</td>
                      <td className="px-3 py-2.5 text-center">
                        {confirmedSkus.has(expandedSku) ? (
                          <span className="text-[10px] font-bold text-green-600 whitespace-nowrap">확인완료</span>
                        ) : (
                          <input type="checkbox" checked={false} onChange={() => toggleConfirmSku(expandedSku)} className="w-4 h-4 cursor-pointer accent-blue-600" />
                        )}
                      </td>
                      <td colSpan={999} className="px-3 py-2.5 font-bold text-sm">
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
                    {/* 비교 분석 섹션 */}
                    {(() => {
                      const sku = expandedSku;
                      const currentRow = allRows.find(r => r.sku === sku);
                      if (!currentRow || currentRow.subRows.length < 2) return null;
                      const baseName = (currentRow.labelName || currentRow.productName || '').split(',')[0].trim();
                      const relatedShipments = [];
                      for (const sh of currentRow.subRows) {
                        relatedShipments.push({ ...sh, option: (currentRow.labelName || '').split(',').slice(1).join(',').trim() || sku, isSelf: true });
                      }
                      for (const other of allRows) {
                        if (other.sku === sku) continue;
                        const otherBase = (other.labelName || other.productName || '').split(',')[0].trim();
                        if (otherBase === baseName && baseName.length > 3) {
                          for (const sh of other.subRows) {
                            relatedShipments.push({ ...sh, sku: other.sku, option: (other.labelName || '').split(',').slice(1).join(',').trim() || other.sku, isSelf: false });
                          }
                        }
                      }
                      const sel = selectedShipments[sku] || (currentRow.subRows.length >= 2 ? [0, 1] : []);
                      const toggleSel = (idx) => {
                        setSelectedShipments(prev => {
                          const cur = prev[sku] || (currentRow.subRows.length >= 2 ? [0, 1] : []);
                          const next = cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx].slice(-5);
                          return { ...prev, [sku]: next };
                        });
                      };
                      const sortedShipments = [...relatedShipments].sort((a, b) => {
                        if (shipCostSort) return shipCostSort === 'asc' ? (a.costPerUnit||0)-(b.costPerUnit||0) : (b.costPerUnit||0)-(a.costPerUnit||0);
                        if (shipDateSort) return shipDateSort === 'asc' ? (a.shipmentKey||'').localeCompare(b.shipmentKey||'') : (b.shipmentKey||'').localeCompare(a.shipmentKey||'');
                        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
                        return (a.shipmentKey||'').localeCompare(b.shipmentKey||'');
                      });
                      const hasRelated = relatedShipments.some(r => !r.isSelf);
                      const avg = currentRow.avgCost;
                      return (
                        <tr><td colSpan={999} className="p-0">
                          <div className="bg-gray-50 border-t-2 border-blue-200 py-5 flex justify-center">
                          <div className="w-full max-w-[1400px] px-4">
                            {/* 출고건 선택 */}
                            <div className="mb-5">
                              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-2 flex-wrap">
                                <span>출고건별 원가 확정 — {relatedShipments.length}건</span>
                                {hasRelated && <span className="text-blue-500">(같은 상품 다른 옵션 포함)</span>}
                                <span>(비교: 최대 5개 선택)</span>
                                <button onClick={() => { setShipDateSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'); setShipCostSort(null); }}
                                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${shipDateSort ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                                  날짜 정렬 {shipDateSort === 'asc' ? '▲' : shipDateSort === 'desc' ? '▼' : '⇅'}
                                </button>
                                <button onClick={() => { setShipCostSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'); setShipDateSort(null); }}
                                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${shipCostSort ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                                  단가 정렬 {shipCostSort === 'asc' ? '▲' : shipCostSort === 'desc' ? '▼' : '⇅'}
                                </button>
                                <input type="text" placeholder="옵션 필터 (예: 10개)" value={shipFilter}
                                  onChange={e => setShipFilter(e.target.value)}
                                  className="px-3 py-1 border border-gray-300 rounded-full text-xs focus:outline-none focus:border-blue-400 w-40" />
                              </p>
                              <div className="space-y-2">
                                {sortedShipments.filter(sh => {
                                  if (!shipFilter.trim()) return true;
                                  const q = shipFilter.trim().toLowerCase();
                                  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                  const regex = new RegExp(`(?<![가-힣])${escaped}`, 'i');
                                  return regex.test(sh.option||'') || (sh.shipmentKey||'').toLowerCase().includes(q) || (sh.sku||'').toLowerCase().includes(q);
                                }).map((sh, j) => {
                                  const origIdx = relatedShipments.indexOf(sh);
                                  const isSelected = sel.includes(origIdx);
                                  const diff = sh.costPerUnit - avg;
                                  const diffPct = avg > 0 ? Math.round((diff / avg) * 10000) / 100 : 0;
                                  const cKey = `${sh.sku}_${sh.shipmentKey}`;
                                  const isConfirmed = ccConfirmed[cKey];
                                  const confirmedCost = ccMemos[cKey];
                                  return (
                                    <div key={j} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${isSelected ? 'bg-blue-50 border-blue-400' : sh.isSelf ? 'bg-white border-gray-200' : 'bg-purple-50/50 border-purple-200'}`}>
                                      <input type="checkbox" checked={isSelected} onChange={() => toggleSel(origIdx)} className="shrink-0" />
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="font-bold text-[#1a2332] shrink-0">{sh.shipmentKey}</span>
                                        {!sh.isSelf && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold shrink-0">다른옵션</span>}
                                        {sh.option && <span className="text-xs text-gray-400 truncate">{sh.option}</span>}
                                        <span className="text-gray-300">|</span>
                                        <span className="font-bold">{formatNum(sh.costPerUnit)}원</span>
                                        <span className={`text-xs ${diff >= 0 ? 'text-red-500' : 'text-blue-600'}`}>({diffPct >= 0 ? '+' : ''}{diffPct}%)</span>
                                        {isConfirmed && confirmedCost && <span className="text-xs font-bold text-green-600 ml-1">→ 확정 {formatNum(Number(confirmedCost))}원</span>}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        {costInputSku === cKey && !isConfirmed ? (
                                          <>
                                            <input type="number" placeholder="원가" autoFocus value={costInputVal}
                                              onChange={e => setCostInputVal(e.target.value)}
                                              className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-right" />
                                            <span className="text-xs text-gray-400">원</span>
                                            <button onClick={() => {
                                              if (costInputVal) {
                                                updateCcMemo(cKey, costInputVal);
                                                setCcConfirmed(prev => { const next = {...prev, [cKey]: true}; localStorage.setItem('costcheck_confirmed', JSON.stringify(next)); return next; });
                                                setCostInputSku(null);
                                              }
                                            }} className="px-2 py-1 bg-green-500 text-white rounded text-xs font-bold hover:bg-green-600">확정</button>
                                            <button onClick={() => setCostInputSku(null)} className="px-2 py-1 bg-gray-200 text-gray-500 rounded text-xs font-bold">취소</button>
                                          </>
                                        ) : (
                                          <button onClick={() => {
                                            if (isConfirmed) {
                                              setCcConfirmed(prev => { const next = {...prev}; delete next[cKey]; localStorage.setItem('costcheck_confirmed', JSON.stringify(next)); return next; });
                                              updateCcMemo(cKey, '');
                                            } else {
                                              setCostInputSku(cKey);
                                              setCostInputVal(String(Math.round(sh.costPerUnit)));
                                            }
                                          }} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${isConfirmed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                                            {isConfirmed ? '원가 확정' : '원가입력'}
                                          </button>
                                        )}
                                        <textarea placeholder="메모" rows={1} value={ccReasons[cKey] || ''}
                                          onChange={e => { setCcReasons(prev => { const next = {...prev, [cKey]: e.target.value}; localStorage.setItem('costcheck_reasons', JSON.stringify(next)); return next; }); }}
                                          onFocus={e => { e.target.rows = 5; e.target.style.width = '200px'; }}
                                          onBlur={e => { e.target.rows = 1; e.target.style.width = '100px'; }}
                                          className="w-[100px] px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400 resize-none transition-all" />
                                        <textarea placeholder="해야할일" rows={1}
                                          value={(() => { try { return JSON.parse(localStorage.getItem('costcheck_todos') || '{}')[cKey] || ''; } catch { return ''; } })()}
                                          onChange={e => { const todos = JSON.parse(localStorage.getItem('costcheck_todos') || '{}'); todos[cKey] = e.target.value; localStorage.setItem('costcheck_todos', JSON.stringify(todos)); setCcConfirmed(p => ({...p})); }}
                                          onFocus={e => { e.target.rows = 5; e.target.style.width = '200px'; }}
                                          onBlur={e => { e.target.rows = 1; e.target.style.width = '100px'; }}
                                          className="w-[100px] px-2 py-1 text-xs border border-orange-200 rounded focus:outline-none focus:border-orange-400 resize-none transition-all" />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 선택 비교 */}
                            {(() => {
                              if (sel.length < 2) return <p className="text-sm text-gray-400 text-center py-4">비교할 출고건을 2~3개 선택하세요</p>;
                              const selected = sel.map(i => relatedShipments[i]).filter(Boolean).sort((a, b) => a.costPerUnit - b.costPerUnit);
                              if (selected.length < 2) return null;
                              const lo = selected[0], hi = selected[selected.length - 1];
                              const totalCostDiff = hi.costPerUnit - lo.costPerUnit;
                              const tdiffPct = lo.costPerUnit > 0 ? Math.round((totalCostDiff / lo.costPerUnit) * 10000) / 100 : 0;
                              const cCostKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
                              const cCostLabelsMap = { purchasingFee:'구매대행 수수료', oceanFreight:'해상운임', documentFee:'DOC FEE', originCertFee:'원산지증명서', customsClearanceFee:'통관수수료', customsDuty:'관세', vat:'부가세', domesticTransport:'내륙운송료' };
                              const costDiffsArr = cCostKeys.map(k => ({ key: k, label: cCostLabelsMap[k], loCost: lo.costs?.[k]?.perUnit || 0, hiCost: hi.costs?.[k]?.perUnit || 0, diff: (hi.costs?.[k]?.perUnit || 0) - (lo.costs?.[k]?.perUnit || 0) }));
                              const cnyDiff = (hi.unitPriceCny || 0) - (lo.unitPriceCny || 0);
                              const descDiff = (loVal, hiVal, unit) => {
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
                                return { text: `${arrow} ${d > 0 ? '+' : ''}${formatNum(d)}${unit} (${pct}%)`, cls: `${color} font-semibold`, note };
                              };
                              return (
                                <div>
                                  {/* 비교 카드 */}
                                  <div className={`grid gap-4 mb-5 ${selected.length >= 5 ? 'grid-cols-5' : selected.length === 4 ? 'grid-cols-4' : selected.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                    {selected.map((sh, si) => {
                                      const isLo = sh === lo, isHi = sh === hi;
                                      const borderColor = isLo ? 'border-blue-200' : isHi ? 'border-red-200' : 'border-gray-200';
                                      const tag = isLo ? '최저' : isHi ? '최고' : '';
                                      const tagColor = isLo ? 'bg-blue-100 text-blue-700' : isHi ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
                                      return (
                                        <div key={si} className={`bg-white rounded-xl border-2 ${borderColor} p-5`}>
                                          <div className="flex items-center justify-between mb-2">
                                            <div>
                                              <span className={`px-2.5 py-1 ${tagColor} rounded-full text-xs font-bold`}>{sh.shipmentKey}</span>
                                              <span className="ml-2 text-xs text-gray-400">{tag ? `${tag} 원가` : '비교'}</span>
                                              {sh.option && <span className="ml-2 text-xs text-gray-500 font-semibold">{sh.option}</span>}
                                            </div>
                                            <p className={`text-xl font-bold ${isHi ? 'text-red-500' : isLo ? 'text-blue-600' : 'text-[#1a2332]'}`}>{formatNum(sh.costPerUnit)}원</p>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 mb-3">
                                            {[
                                              ['단가', `${sh.unitPriceRaw || sh.unitPriceCny}`],
                                              ['운임단가', `${sh.chinaShippingPerUnit || (sh.unitPriceCny && sh.unitPriceRaw ? Math.round((sh.unitPriceCny - sh.unitPriceRaw) * 100) / 100 : 0)}`],
                                              ['출고수량', `${sh.shippedQty}개`],
                                              ['CBM/개', sh.cbmPerUnit != null ? `${sh.cbmPerUnit}` : '—'],
                                              ['해상운임', sh.costs?.oceanFreight?.perUnit ? `${formatNum(sh.costs.oceanFreight.perUnit)}` : '—'],
                                              ['환율', sh.exchangeRate ? `${sh.exchangeRate}` : '—'],
                                            ].map(([label, val], idx) => {
                                              const loSh = selected[0];
                                              const getShipping = (s2) => s2.chinaShippingPerUnit || (s2.unitPriceCny && s2.unitPriceRaw ? Math.round((s2.unitPriceCny - s2.unitPriceRaw) * 100) / 100 : 0);
                                              const vals = [
                                                [sh.unitPriceRaw || sh.unitPriceCny, loSh.unitPriceRaw || loSh.unitPriceCny],
                                                [getShipping(sh), getShipping(loSh)],
                                                [sh.shippedQty, loSh.shippedQty],
                                                [sh.cbmPerUnit, loSh.cbmPerUnit],
                                                [sh.costs?.oceanFreight?.perUnit || 0, loSh.costs?.oceanFreight?.perUnit || 0],
                                                [sh.exchangeRate, loSh.exchangeRate],
                                              ];
                                              const isHigher = isHi && vals[idx] && Number(vals[idx][0]) > Number(vals[idx][1]);
                                              return (
                                                <div key={idx} className="text-center">
                                                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                                                  <p className={`text-base font-bold ${isHigher ? 'text-red-500' : 'text-[#1a2332]'}`}>{val}</p>
                                                </div>
                                              );
                                            })}
                                          </div>
                                          {isHi && <p className="text-center text-red-500 font-bold text-base">▲ +{formatNum(totalCostDiff)}원 (+{tdiffPct}%)</p>}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* 이유 분석 */}
                                  {(() => {
                                    const analyses = [];
                                    const rate = hi.exchangeRate || lo.exchangeRate || 195;
                                    const higherCosts = costDiffsArr.filter(cd => cd.diff > 10).sort((a, b) => b.diff - a.diff);
                                    if (cnyDiff > 0) {
                                      const impact = Math.round(cnyDiff * rate);
                                      analyses.push({ title: '단가 인상', summary: `${lo.unitPriceCny}위안 → ${hi.unitPriceCny}위안으로 개당 +${formatNum(impact)}원 증가`, impact, details: [`${hi.shipmentKey}의 단가가 ${lo.shipmentKey}보다 ${Math.round(cnyDiff * 100) / 100}위안 높음`, `원화 환산 시 개당 약 +${formatNum(impact)}원 상승 요인`] });
                                    }
                                    if (hi.shippedQty < lo.shippedQty) {
                                      analyses.push({ title: '수량 감소 → 고정비 배분 증가', summary: `${lo.shippedQty}개 → ${hi.shippedQty}개로 ${lo.shippedQty - hi.shippedQty}개 감소`, impact: 0, details: ['수량이 적을수록 해상운임·통관비 등 고정비가 개당 더 많이 배분됨', '각 비용 항목 상승의 간접 원인'] });
                                    }
                                    if (hi.cbmPerUnit && lo.cbmPerUnit && hi.cbmPerUnit > lo.cbmPerUnit) {
                                      const ratio = lo.cbmPerUnit > 0 ? hi.cbmPerUnit / lo.cbmPerUnit : 0;
                                      const oceanHi = hi.costs?.oceanFreight?.perUnit || 0, oceanLo = lo.costs?.oceanFreight?.perUnit || 0;
                                      const impact = Math.round(oceanHi - oceanLo);
                                      if (ratio > 2) {
                                        analyses.push({ title: '해상운임 상승 (CBM 이상값 의심)', summary: `${formatNum(oceanLo)}원 → ${formatNum(oceanHi)}원으로 개당 +${formatNum(impact)}원 증가`, impact, details: [`${hi.shipmentKey}의 CBM ${hi.cbmPerUnit} vs ${lo.shipmentKey}의 CBM ${lo.cbmPerUnit} → ${Math.round(ratio)}배 차이`], warn: true });
                                      } else if (oceanHi > oceanLo) {
                                        analyses.push({ title: 'CBM 증가 → 해상운임 상승', summary: `${formatNum(oceanLo)}원 → ${formatNum(oceanHi)}원으로 개당 +${formatNum(impact)}원 상승`, impact, details: [`개당 CBM: ${lo.cbmPerUnit} → ${hi.cbmPerUnit}로 상승`] });
                                      }
                                    }
                                    const hasCbmIssue = analyses.some(a => a.title.includes('CBM'));
                                    for (const cd of higherCosts) {
                                      if (hasCbmIssue && cd.key === 'oceanFreight') continue;
                                      if (analyses.length >= 5) break;
                                      const details = [];
                                      if (cd.key === 'oceanFreight') {
                                        if (hi.cbmPerUnit && lo.cbmPerUnit && hi.cbmPerUnit !== lo.cbmPerUnit) details.push(`개당 CBM: ${lo.cbmPerUnit} → ${hi.cbmPerUnit}`);
                                        if (hi.shippedQty < lo.shippedQty) details.push(`수량 ${lo.shippedQty}개 → ${hi.shippedQty}개 감소로 고정비 배분 증가`);
                                        if (!details.length) details.push('출고건별 총 해상운임 또는 CBM 비율 차이로 인한 배분 변동');
                                      } else if (cd.key === 'domesticTransport') {
                                        if (hi.shippedQty < lo.shippedQty) details.push(`수량 ${lo.shippedQty}개 → ${hi.shippedQty}개 감소로 내륙운송비 개당 배분 증가`);
                                        if (!details.length) details.push('출고건별 총 내륙운송비 또는 수량/CBM 차이로 배분 변동');
                                      } else if (cd.key === 'vat') {
                                        details.push('부가세는 (상품원가 + 관세) × 10%로 계산');
                                      } else if (cd.key === 'customsDuty') {
                                        details.push('관세는 상품원가 × 관세율로 계산');
                                      } else if (cd.key === 'purchasingFee') {
                                        details.push('구매대행 수수료는 총금액의 1%로 계산');
                                      } else {
                                        details.push('출고건별 비용 차이 또는 배분 비율 변동');
                                      }
                                      analyses.push({ title: `${cd.label} 상승`, summary: `${formatNum(cd.loCost)}원 → ${formatNum(cd.hiCost)}원으로 개당 +${formatNum(cd.diff)}원 증가`, impact: Math.round(cd.diff), details });
                                    }
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
                                                {a.details && a.details.map((d, di) => <p key={di} className="text-[#1a2332] text-sm leading-relaxed">{di + 1}) {d}</p>)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* 항목별 비교표 */}
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
                                          <td className="px-4 py-3 text-right text-blue-600">{formatNum(lo.costPerUnit)}원</td>
                                          <td className="px-4 py-3 text-right text-red-500">{formatNum(hi.costPerUnit)}원</td>
                                          <td className="px-4 py-3 text-right text-red-500 text-xs">▲ +{formatNum(totalCostDiff)}원 (+{tdiffPct}%)</td>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          const rows = [
                                            { label: '단가(CNY)', loVal: lo.unitPriceCny, hiVal: hi.unitPriceCny, unit: '위안', decimal: 2 },
                                            { label: '수수료1%', loVal: lo.costs?.purchasingFee?.perUnit, hiVal: hi.costs?.purchasingFee?.perUnit, unit: '원', isCost: true },
                                            { label: '해상운임', loVal: lo.costs?.oceanFreight?.perUnit, hiVal: hi.costs?.oceanFreight?.perUnit, unit: '원', isCost: true },
                                            { label: 'DOC FEE', loVal: lo.costs?.documentFee?.perUnit, hiVal: hi.costs?.documentFee?.perUnit, unit: '원', isCost: true },
                                            { label: '원산지증명서', loVal: lo.costs?.originCertFee?.perUnit, hiVal: hi.costs?.originCertFee?.perUnit, unit: '원', isCost: true },
                                            { label: '통관수수료', loVal: lo.costs?.customsClearanceFee?.perUnit, hiVal: hi.costs?.customsClearanceFee?.perUnit, unit: '원', isCost: true },
                                            { label: '관세', loVal: lo.costs?.customsDuty?.perUnit, hiVal: hi.costs?.customsDuty?.perUnit, unit: '원', isCost: true },
                                            { label: '부가세', loVal: lo.costs?.vat?.perUnit, hiVal: hi.costs?.vat?.perUnit, unit: '원', isCost: true },
                                            { label: '내륙운송료', loVal: lo.costs?.domesticTransport?.perUnit, hiVal: hi.costs?.domesticTransport?.perUnit, unit: '원', isCost: true },
                                          ];
                                          const rowsWithDiff = rows.map(r => ({ ...r, diff: (r.hiVal || 0) - (r.loVal || 0) }));
                                          if (compareSort === 'asc') rowsWithDiff.sort((a, b) => a.diff - b.diff);
                                          else if (compareSort === 'desc') rowsWithDiff.sort((a, b) => b.diff - a.diff);
                                          const fmtN = (v, decimal) => v == null ? '—' : decimal === 0 ? Math.round(v) : Math.round(v * Math.pow(10, decimal)) / Math.pow(10, decimal);
                                          return rowsWithDiff.map((r, ri) => {
                                            const lv = r.loVal || 0, hv = r.hiVal || 0;
                                            const d = r.isCost ? descDiff(lv, hv, r.unit) : null;
                                            const fmtVal = (v) => r.isCost ? `${formatNum(v)}${r.unit}` : `${fmtN(v, r.decimal)}${r.unit}`;
                                            const fmtDiffVal = (v) => r.isCost ? formatNum(Math.abs(v)) : fmtN(Math.abs(v), r.decimal);
                                            return (
                                              <tr key={ri} className={`border-b border-gray-50 ${d && d.note ? 'bg-yellow-50/40' : ''}`}>
                                                <td className="px-4 py-2.5 font-semibold text-gray-700">{r.label}</td>
                                                <td className="px-4 py-2.5 text-right">{fmtVal(lv)}</td>
                                                <td className="px-4 py-2.5 text-right">{fmtVal(hv)}</td>
                                                <td className={`px-4 py-2.5 text-right text-xs ${d ? d.cls : ''}`}>
                                                  {d ? <>{d.text}{d.note && <span className="block text-orange-500 text-[11px]">{d.note}</span>}</>
                                                    : Math.abs(r.diff) >= 0.01
                                                      ? <span className={`font-semibold ${r.diff > 0 ? 'text-red-500' : 'text-blue-600'}`}>{r.diff > 0 ? '▲' : '▼'} {fmtDiffVal(r.diff)}{r.unit}</span>
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
                        </td></tr>
                      );
                    })()}
                  </>
                ) : (
                  filtered.slice(0, displayCount).map((row, i) => {
                    const group = skuGroups[row.sku];
                    const hasMultiple = group && group.rows.length > 1;
                    return (
                      <tr key={i} className={`${showRecommend && recommendedSkus.has(row.sku) ? 'bg-yellow-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className={`px-3 py-2.5 text-center text-gray-400 ${hasMultiple ? 'cursor-pointer hover:text-blue-600' : ''}`} onClick={() => hasMultiple && toggleExpand(row.sku)}>{hasMultiple ? '▼' : ''}</td>
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
                        <td className={`px-3 py-2 text-center font-bold ${row.costRange > 0 ? 'text-orange-600' : ''}`}>{row.costRange ? formatNum(row.costRange) + '원' : '-'}</td>
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
