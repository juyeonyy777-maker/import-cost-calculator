'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ── 유틸 ── */
function fmt(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

function sendLog(user, action, detail) {
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: user, action, detail }) }).catch(() => {});
}

/* ── 리사이즈 가능한 TH ── */
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

/* ── 메인 ── */
export default function Home() {
  const [userName, setUserName] = useState('');
  const [nameOk, setNameOk] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelFile2, setExcelFile2] = useState(null);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const invoiceFilesRef = useRef([]);
  const [declarationFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [parsedInfo, setParsedInfo] = useState(null);
  const [yuanMap, setYuanMap] = useState({});
  const [skuAvgCost, setSkuAvgCost] = useState({});
  const [skuShipCount, setSkuShipCount] = useState({});
  const [recent5, setRecent5] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const dropRef = useRef(null);

  useEffect(() => { const s = localStorage.getItem('userName'); if (s) { setUserName(s); setNameOk(true); } }, []);
  useEffect(() => { const p = e => e.preventDefault(); window.addEventListener('dragover', p); window.addEventListener('drop', p); return () => { window.removeEventListener('dragover', p); window.removeEventListener('drop', p); }; }, []);

  /* ── 파일 자동 분류 (ZIP 해제 포함) ── */
  const classifyAndSet = async (files, isTop = true) => {
    const pdfFiles = [];
    for (const f of files) {
      const name = f.name.toLowerCase();
      if (name.endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(f);
          const extracted = [];
          for (const [fn, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const blob = await entry.async('blob');
            extracted.push(new File([blob], fn, { type: blob.type }));
          }
          const zipPdfs = await classifyAndSet(extracted, false);
          pdfFiles.push(...zipPdfs);
        } catch (e) { console.error('ZIP 해제 실패:', e); }
        continue;
      }
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
      const isPdf = name.endsWith('.pdf');
      if (isExcel && name.includes('출고내역')) { setExcelFile2(f); sendLog(userName, '파일업로드', '출고내역: ' + f.name); }
      else if (isExcel) { setExcelFile(f); sendLog(userName, '파일업로드', '결제명세서: ' + f.name); }
      else if (isPdf) { pdfFiles.push(f); sendLog(userName, '파일업로드', '청구서: ' + f.name); }
    }
    if (isTop && pdfFiles.length > 0) {
      const existingNames = new Set(invoiceFilesRef.current.map(f => f.name));
      const newFiles = pdfFiles.filter(f => !existingNames.has(f.name));
      const merged = [...invoiceFilesRef.current, ...newFiles];
      invoiceFilesRef.current = merged;
      setInvoiceFiles(merged);
    }
    return pdfFiles;
  };

  /* ── 원가 계산 ── */
  const handleCalc = async () => {
    if (!excelFile) { setError('결제명세서를 업로드해주세요.'); return; }
    if (!excelFile2) { setError('출고내역을 업로드해주세요.'); return; }
    const currentInvoices = invoiceFilesRef.current;
    if (currentInvoices.length === 0) { setError('청구서 PDF를 업로드해주세요.'); return; }
    sendLog(userName, '원가계산', ''); setLoading(true); setError(''); setResult(null);

    const fd = new FormData();
    fd.append('excel', excelFile); fd.append('excel2', excelFile2);
    for (const f of currentInvoices) fd.append('invoice', f);
    if (declarationFile) fd.append('declaration', declarationFile);

    try {
      const res = await fetch('/api/calculate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '계산 오류'); return; }

      setResult(data.data); setParsedInfo(data.parsed);
      setYuanMap(data.yuanMap || {}); setSkuAvgCost(data.skuAvgCost || {}); setSkuShipCount(data.skuShipCount || {}); setRecent5(data.recent5AvgRatio);

      const bE = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const bI = data.parsed?.invoice?.packages || 0;
      console.log('[박스체크] 청구서:', bI, '출고내역:', bE, '차이:', Math.abs(bI - bE));
      if (bI > 0 && bE > 0 && Math.abs(bI - bE) >= 2) {
        alert(`박스수량 불일치!\n청구서: ${bI}CTN / 출고내역: ${bE}상자`);
        setResult(null); setParsedInfo(null); return;
      }

      const invBl = data.parsed?.invoice?.blNo || '';
      const declBl = data.parsed?.declaration?.blNo || '';
      if (invBl && declBl && invBl !== declBl) { alert(`B/L NO 불일치!\n청구서: ${invBl}\n정산서: ${declBl}`); setResult(null); setParsedInfo(null); return; }

      const code = data.parsed?.excel?.shipmentCode || '';
      const bc = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const shipKey = code ? code + '-' + bc + '박스' : '';
      if (shipKey) {
        try {
          const sr = await fetch('/api/save-all', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentKey: shipKey, rows: data.data.results }) });
          const sd = await sr.json();
          if (sd.success) sendLog(userName, '자동저장', shipKey);
        } catch (e) { console.error('자동 저장 실패:', e); }
      }
    } catch (err) { setError(`요청 실패: ${err.message}`); } finally { setLoading(false); }
  };

  /* ── EXCEL 다운로드 (SKU별) ── */
  const handleDownloadSku = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', 'SKU별');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const cLabels = ['수수료1%','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const shipLabel = (parsedInfo?.excel?.shipmentCode || '') + (parsedInfo?.excel?.boxCount ? '-' + parsedInfo.excel.boxCount + '박스' : '');
    const wsData = [
      ['출고', 'SKU', '품명', '수량', '단가(CNY)', '후불작업비용', '수수료7%', '원가(개당)', '원가(x285)', ...cLabels],
      ...result.results.map(r => [
        shipLabel, r.sku, r.productName, r.shippedQty, r.unitPriceCny,
        0.7, r.commission, r.costPerUnit, Math.round(r.unitPriceRaw * 285),
        ...cKeys.map(k => r.costs?.[k]?.perUnit || 0),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch:18 },{ wch:20 },{ wch:40 },{ wch:8 },{ wch:10 },{ wch:12 },{ wch:10 },{ wch:12 },{ wch:12 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 }];
    XLSX.utils.book_append_sheet(wb, ws, '수입원가');
    XLSX.writeFile(wb, `수입원가_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ── EXCEL 다운로드 (전체 요약) ── */
  const handleDownloadFull = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', '전체요약');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const cLabels = ['구매대행수수료','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const ws1Data = [
      ['SKU','품명','출고수량','단가(CNY)','환율','수입원가(개당)',...cLabels,'수입원가(총)'],
      ...result.results.map(r => [
        r.sku, r.productName, r.shippedQty, r.unitPriceCny, r.exchangeRate, r.costPerUnit,
        ...cKeys.map(k => r.costs?.[k]?.total || 0), r.totalImportCost,
      ]),
    ];
    const ws2Data = [
      ['항목','금액 (KRW)'], ['총 SKU 수', result.summary.totalSkus], ['총 수량', result.summary.totalQty],
      ['총 금액 (CNY)', result.summary.totalAmountCny], ['총 CBM', result.summary.totalCbm],
      [''], ['비용 항목','금액 (KRW)'],
      ...Object.entries(result.summary.costs).map(([k, v]) => [k, v]),
      [''], ['총 수입원가', result.summary.totalImportCost],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws1, '수입원가');
    XLSX.utils.book_append_sheet(wb, ws2, '요약');
    XLSX.writeFile(wb, `수입원가_전체_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ── 초기화 ── */
  const handleReset = () => {
    sendLog(userName, '초기화', '');
    setExcelFile(null); setExcelFile2(null); setInvoiceFiles([]); invoiceFilesRef.current = [];
    setResult(null); setError(''); setParsedInfo(null); setYuanMap({}); setSkuAvgCost({}); setSkuShipCount({}); setRecent5(null);
    document.querySelectorAll('input[type="file"]').forEach(i => { i.value = ''; });
  };

  /* ═══════════════ 이름 입력 화면 ═══════════════ */
  if (!nameOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f6fa]">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-10 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-[#1a2332] rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-lg font-bold tracking-tight">IC</span>
          </div>
          <h1 className="text-xl font-bold text-[#1a2332] mb-1">수입원가 계산기</h1>
          <p className="text-sm text-gray-400 mb-8">이름을 입력하세요</p>
          <input type="text" placeholder="이름" value={userName}
            onChange={e => setUserName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && userName.trim()) { localStorage.setItem('userName', userName.trim()); sendLog(userName.trim(), '로그인', ''); setNameOk(true); } }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors mb-4" autoFocus />
          <button onClick={() => { if (userName.trim()) { localStorage.setItem('userName', userName.trim()); sendLog(userName.trim(), '로그인', ''); setNameOk(true); } }}
            disabled={!userName.trim()} className="w-full py-3 bg-[#3b82f6] text-white rounded-lg font-semibold text-base hover:bg-[#2563eb] disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
            시작하기
          </button>
          <button onClick={() => window.open('/guide', '_blank')} className="w-full mt-3 py-2.5 bg-[#f5f6fa] text-[#1a2332] border border-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors">사용방법 보기</button>
        </div>
      </div>
    );
  }

  /* ═══════════════ 메인 화면 ═══════════════ */
  const COST_COLS = [
    { key: 'purchasingFee', label: '수수료1%' }, { key: 'oceanFreight', label: '해상운임' },
    { key: 'documentFee', label: 'DOC' }, { key: 'originCertFee', label: '원산지' },
    { key: 'customsClearanceFee', label: '통관' }, { key: 'customsDuty', label: '관세' },
    { key: 'vat', label: '부가세' }, { key: 'domesticTransport', label: '내륙운송' },
  ];

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';

  let rows = result?.results || [];
  if (sortKey && sortDir && rows.length > 0) {
    rows = [...rows].sort((a, b) => {
      let va, vb;
      if (sortKey === 'ratio') {
        va = a.unitPriceCny > 0 ? a.costPerUnit / a.unitPriceCny : 0;
        vb = b.unitPriceCny > 0 ? b.costPerUnit / b.unitPriceCny : 0;
      } else if (sortKey === 'costX285') {
        va = Math.round(a.unitPriceRaw * 285);
        vb = Math.round(b.unitPriceRaw * 285);
      } else if (sortKey === 'costDiff') {
        va = Math.round(a.unitPriceRaw * 285) - (a.costPerUnit || 0);
        vb = Math.round(b.unitPriceRaw * 285) - (b.costPerUnit || 0);
      } else if (sortKey === 'avgCost') {
        va = skuAvgCost[a.sku] || 0;
        vb = skuAvgCost[b.sku] || 0;
      } else if (sortKey.startsWith('cost_')) {
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

  const costSums = {};
  for (const col of COST_COLS) costSums[col.key] = rows.reduce((s, r) => s + (r.costs?.[col.key]?.total || 0), 0);
  const allocTotal = COST_COLS.reduce((s, col) => s + costSums[col.key], 0);
  const invoiceTotal = parsedInfo?.invoice?.totalAmount || 0;
  const allocDiff = allocTotal - invoiceTotal;
  const excelCny = (parsedInfo?.excel?.totals?.totalAmount || 0) + (parsedInfo?.excel?.totals?.totalShipping || 0);
  const calcCny = rows.reduce((s, r) => s + r.unitPriceCny * r.shippedQty, 0);
  const cnyDiff = calcCny - excelCny;

  const shipLabel = (parsedInfo?.excel?.shipmentCode || '') + (parsedInfo?.excel?.boxCount ? '-' + parsedInfo.excel.boxCount + '박스' : parsedInfo?.excel?.boxCount2 ? '-' + parsedInfo.excel.boxCount2 + '박스' : '');
  const thBase = 'px-3 py-2.5 text-center font-semibold whitespace-nowrap text-sm';

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex">
      {/* ── 사이드바 ── */}
      <aside className="w-[200px] bg-[#1a2332] min-h-screen flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen z-50">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-[#2a3a52]">
          <div className="w-7 h-7 bg-[#3b82f6] rounded-lg flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">IC</span>
          </div>
          <span className="text-white font-bold text-sm">수입원가 계산기</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <div className="bg-[#253347] text-blue-400 rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center gap-2.5 cursor-default">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            원가 계산기
          </div>
          <button onClick={() => window.open('/confirmed', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            확정 원가
          </button>
          <button onClick={() => window.open('/data', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
            전체 데이터 조회
          </button>
          <button onClick={() => window.open('/cbm-needed', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            CBM 입력필요
          </button>
          <button onClick={() => window.open('/cost-check', '_blank')} className="w-full text-left text-gray-400 hover:text-white hover:bg-[#253347] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            원가 이상치
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

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 ml-[200px] min-w-0">
        {/* 상단 헤더 */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="px-8 h-12 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1a2332]">
              {result ? '계산 결과' : '원가 계산'}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1a2332]">{userName}님</span>
                <button onClick={() => { localStorage.removeItem('userName'); setUserName(''); setNameOk(false); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">변경</button>
              </div>
            </div>
          </div>
        </header>

        <div className="px-8 py-6">

          {/* ═══ 파일 업로드 (결과 없을 때) ═══ */}
          {!result && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 max-w-4xl">
              <h3 className="text-base font-bold text-[#1a2332] mb-5 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded flex items-center justify-center text-xs font-bold">1</span>
                서류 업로드
              </h3>

              {/* 통합 드래그앤드롭 */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all mb-6 ${
                  (excelFile && excelFile2 && invoiceFiles.length > 0) ? 'border-green-300 bg-green-50/30' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/20'
                }`}
                onClick={() => dropRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); classifyAndSet(e.dataTransfer.files); }}
              >
                <input ref={dropRef} type="file" accept=".xlsx,.xls,.pdf,.zip" multiple className="hidden"
                  onChange={e => { classifyAndSet(e.target.files); e.target.value = ''; }} />
                <div className="mb-8">
                  <div className="w-16 h-16 bg-[#f5f6fa] rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <p className="font-semibold text-base text-gray-700">파일을 드래그하거나 클릭하세요</p>
                  <p className="text-sm text-gray-400 mt-1">엑셀 + PDF 또는 ZIP 파일 (자동 분류)</p>
                </div>
                <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                  {[
                    { label: '결제명세서', file: excelFile, req: true },
                    { label: '출고내역', file: excelFile2, req: true },
                  ].map(({ label, file, req }) => (
                    <div key={label} className={`rounded-lg p-3 transition-all ${file ? 'bg-green-50 border border-green-300' : 'bg-gray-50 border border-gray-200'}`}>
                      <p className={`font-semibold text-sm ${file ? 'text-green-700' : 'text-gray-600'}`}>{label}</p>
                      <p className={`text-xs mt-1 truncate ${file ? 'text-green-500' : req ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>{file ? file.name : '필수'}</p>
                    </div>
                  ))}
                  <div className={`rounded-lg p-3 transition-all cursor-pointer ${invoiceFiles.length > 0 ? 'bg-green-50 border border-green-300' : 'bg-gray-50 border border-gray-200'}`}
                    onClick={(e) => { e.stopPropagation(); document.getElementById('pdf-input').click(); }}>
                    <input id="pdf-input" type="file" accept=".pdf" multiple className="hidden"
                      onChange={e => { const pdfs = Array.from(e.target.files || []); if (pdfs.length > 0) { invoiceFilesRef.current = pdfs; setInvoiceFiles(pdfs); } e.target.value = ''; }} />
                    <p className={`font-semibold text-sm ${invoiceFiles.length > 0 ? 'text-green-700' : 'text-gray-600'}`}>청구서 ({invoiceFiles.length}장)</p>
                    <p className={`text-xs mt-1 truncate ${invoiceFiles.length > 0 ? 'text-green-500' : 'text-red-400 font-semibold'}`}>{invoiceFiles.length > 0 ? invoiceFiles.map(f => f.name).join(', ') : 'PDF 선택'}</p>
                  </div>
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-4 mb-6 text-sm whitespace-pre-line">{error}</div>}

              <div className="flex gap-3">
                <button onClick={handleCalc} disabled={loading}
                  className="px-6 py-2.5 bg-[#3b82f6] text-white rounded-lg font-semibold text-sm hover:bg-[#2563eb] disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                  {loading ? '계산 중...' : '원가 계산'}
                </button>
                <button onClick={handleReset} className="px-5 py-2.5 bg-white text-gray-500 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors">초기화</button>
              </div>
            </div>
          )}

          {/* ═══ 결과 화면 ═══ */}
          {result && (
            <>
              {/* 뒤로가기 버튼 */}
              <div className="mb-4">
                <button onClick={handleReset} className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <span>←</span> 새 파일 계산
                </button>
              </div>

              {/* 비용 요약 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-[#1a2332]">비용 요약</h3>
                    {parsedInfo?.excel?.shipmentCode && (
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-semibold border border-blue-100">
                        {parsedInfo.excel.shipmentCode}-{parsedInfo.excel.boxCount || parsedInfo.excel.boxCount2 || 0}박스
                      </span>
                    )}
                  </div>
                </div>

                {/* 최근5건 평균비율 */}
                {recent5 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-base text-gray-700">최근5건 평균비율</span>
                      <span className="font-bold text-red-600 text-2xl">{recent5.avg}</span>
                      <button onClick={() => window.open('/ratio', '_blank')} className="px-2 py-1 bg-red-50 text-red-500 rounded text-xs font-semibold hover:bg-red-100 border border-red-200">전체보기</button>
                    </div>
                    {recent5.detail && (
                      <div className="flex gap-4 text-sm text-gray-500">
                        {recent5.detail.map(d => <span key={d.key}>{d.key}: <b className="text-gray-700">{d.avg}</b></span>)}
                      </div>
                    )}
                  </div>
                )}

                {/* 숫자 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-blue-600 mb-1">총 수입원가</p>
                    <p className="text-2xl font-bold text-[#1a2332]">{fmt(
                      result.results.reduce((s, r) => s + r.productCostKrw * r.shippedQty, 0)
                      + Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * (result.summary.exchangeRateCNY || 195))
                      + (parsedInfo?.invoice?.totalAmount || 0)
                    )}<span className="text-sm ml-0.5 text-gray-500">원</span></p>
                  </div>
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-pink-600 mb-1">1. 총 제품비(CNY)</p>
                    <p className="text-xl font-bold text-[#1a2332]">{Math.round(((parsedInfo?.excel?.totals?.totalAmount || 0) + (parsedInfo?.excel?.totals?.totalShipping || 0)) * 100) / 100} <span className="text-sm text-gray-500">CNY</span></p>
                    <p className="text-base font-semibold text-gray-600">= {fmt(result.results.reduce((s, r) => s + r.productCostKrw * r.shippedQty, 0))}원</p>
                  </div>
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-purple-600 mb-1">2. 총 수수료(CNY)</p>
                    <p className="text-xl font-bold text-[#1a2332]">{Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * 100) / 100} <span className="text-sm text-gray-500">CNY</span></p>
                    <p className="text-base font-semibold text-gray-600">= {fmt(Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * (result.summary.exchangeRateCNY || 195)))}원</p>
                    <p className="text-sm text-gray-400 mt-0.5">SOP {Math.round(0.7 * result.summary.totalQty * 100) / 100} CNY</p>
                    <p className="text-sm text-gray-400">수수료7% {Math.round(result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0) * 100) / 100} CNY</p>
                  </div>
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-orange-600 mb-1">3. 총 부대비용</p>
                    <p className="text-xl font-bold text-[#1a2332]">{fmt(invoiceTotal)}<span className="text-sm ml-0.5 text-gray-500">원</span></p>
                  </div>
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-gray-500 mb-1">총 수량</p>
                    <p className="text-xl font-bold text-[#1a2332]">{fmt(result.summary.totalQty)}<span className="text-sm ml-0.5 text-gray-500">개</span></p>
                  </div>
                  <div className="bg-[#f5f6fa] rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-semibold text-gray-500 mb-1">전체 CBM</p>
                    <p className="text-xl font-bold text-[#1a2332]">{Math.round((result.summary.totalCbm || 0) * 10000) / 10000}</p>
                  </div>
                </div>
              </div>

              {/* ═══ SKU별 테이블 ═══ */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* 오차 표시 바 */}
                <div className="px-5 py-2.5 bg-[#f5f6fa] flex flex-col items-end gap-1 text-sm">
                  {invoiceTotal > 0 && (
                    <div className="flex items-center gap-6">
                      <span className="text-gray-500">청구서 <b className="text-[#1a2332]">{fmt(invoiceTotal)}원</b></span>
                      <span className="text-gray-500">배분합 <b className="text-[#1a2332]">{fmt(allocTotal)}원</b></span>
                      <span className={`font-bold ${allocDiff >= 0 ? 'text-blue-600' : 'text-red-500'}`}>오차 {allocDiff >= 0 ? '+' : ''}{fmt(allocDiff)}원</span>
                    </div>
                  )}
                  {excelCny > 0 && (
                    <div className="flex items-center gap-6">
                      <span className="text-gray-500">출고내역 <b className="text-[#1a2332]">{Math.round(excelCny * 100) / 100} CNY</b></span>
                      <span className="text-gray-500">계산기 <b className="text-[#1a2332]">{Math.round(calcCny * 100) / 100} CNY</b></span>
                      <span className={`font-bold ${cnyDiff >= 0 ? 'text-blue-600' : 'text-red-500'}`}>오차 {cnyDiff >= 0 ? '+' : ''}{Math.round(cnyDiff * 100) / 100} CNY</span>
                    </div>
                  )}
                </div>

                <div className="px-5 py-2.5 border-t border-b border-gray-200 flex items-center gap-2">
                  <button onClick={handleDownloadSku} className="px-3 py-1.5 bg-[#3b82f6] text-white rounded-md text-xs font-semibold hover:bg-[#2563eb] transition-colors">전체 EXCEL 다운</button>
                  <button onClick={() => window.open('/logic', '_blank')} className="px-3 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-md text-xs font-semibold hover:bg-gray-50 transition-colors">컬럼 로직</button>
                  <button onClick={() => window.open('/data', '_blank')} className="px-3 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-md text-xs font-semibold hover:bg-gray-50 transition-colors">전체 데이터 조회</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-sm" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                    <thead className="bg-[#f5f6fa] border-t border-gray-200">
                      <tr>
                        <RTh className={`${thBase} sticky left-0 bg-[#f5f6fa] z-10 cursor-pointer hover:text-blue-600`} initialWidth="100px" minWidth={40} onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</RTh>
                        <RTh className={`${thBase}`} initialWidth="55px">출고회수</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="60px" onClick={() => handleSort('cbmPerUnit')}>CBM{sortIcon('cbmPerUnit')}</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="180px" onClick={() => handleSort('productName')}>상품명{sortIcon('productName')}</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="45px" onClick={() => handleSort('shippedQty')}>수량{sortIcon('shippedQty')}</RTh>
                        <RTh className={`${thBase} bg-pink-50/70 cursor-pointer hover:text-blue-600`} initialWidth="70px" onClick={() => handleSort('unitPriceCny')}>단가{sortIcon('unitPriceCny')}</RTh>
                        <RTh className={`${thBase} bg-pink-50/70`} initialWidth="50px">후불</RTh>
                        <RTh className={`${thBase} bg-pink-50/70 cursor-pointer hover:text-blue-600`} initialWidth="55px" onClick={() => handleSort('commission')}>수수료{sortIcon('commission')}</RTh>
                        <RTh className={`${thBase} bg-amber-50/70 cursor-pointer hover:text-blue-600`} initialWidth="80px" onClick={() => handleSort('costPerUnit')}>원가(개당){sortIcon('costPerUnit')}</RTh>
                        <RTh className={`${thBase} bg-purple-50/70 cursor-pointer hover:text-blue-600`} initialWidth="75px" onClick={() => handleSort('avgCost')}>평균원가{sortIcon('avgCost')}</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="60px" onClick={() => handleSort('ratio')}>배수{sortIcon('ratio')}</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="75px" onClick={() => handleSort('costX285')}>x285{sortIcon('costX285')}</RTh>
                        <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="65px" onClick={() => handleSort('costDiff')}>차이{sortIcon('costDiff')}</RTh>
                        {COST_COLS.map(c => <RTh key={c.key} className={`${thBase} bg-sky-50/70 cursor-pointer hover:text-blue-600`} initialWidth="75px" onClick={() => handleSort('cost_' + c.key)}>{c.label}{sortIcon('cost_' + c.key)}</RTh>)}
                      </tr>
                    </thead>
                    <tbody>
                      {/* 실제 비용 행 */}
                      <tr className="border-b border-gray-200 font-semibold bg-emerald-50/50 text-xs">
                        <td className="px-3 py-2 sticky left-0 bg-emerald-50/50 z-10 font-bold">실제 비용</td>
                        <td className="px-3 py-2"></td><td className="px-3 py-2"></td><td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td><td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right text-red-500 font-bold whitespace-nowrap">
                          평균 {(() => { const r = rows.filter(r => r.unitPriceCny > 0).map(r => r.costPerUnit / r.unitPriceCny); return r.length > 0 ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 100) / 100 : '-'; })()}
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                        {COST_COLS.map(col => {
                          const c = parsedInfo?.invoice?.costs?.[col.key];
                          const v = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                          return <td key={col.key} className="px-3 py-2 text-right">{v > 0 ? fmt(v) + '원' : ''}</td>;
                        })}
                      </tr>
                      {/* 배분 총합 행 */}
                      <tr className="border-b-2 border-blue-200 font-semibold bg-emerald-50/50 text-xs">
                        <td className="px-3 py-2 sticky left-0 bg-emerald-50/50 z-10 font-bold">배분 총합</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + (r.cbmPerUnit || 0) * r.shippedQty, 0) * 10000) / 10000}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + r.shippedQty, 0))}</td>
                        <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + r.unitPriceCny * r.shippedQty, 0) * 100) / 100}</td>
                        <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + 0.7 * r.shippedQty, 0) * 100) / 100}</td>
                        <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0) * 100) / 100}</td>
                        <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + r.costPerUnit * r.shippedQty, 0))}원</td>
                        <td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + Math.round(r.unitPriceRaw * 285) * r.shippedQty, 0))}원</td>
                        <td className="px-3 py-2"></td>
                        {COST_COLS.map(col => {
                          const c = parsedInfo?.invoice?.costs?.[col.key];
                          const actual = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                          const d = Math.round(costSums[col.key]) - Math.round(actual);
                          const clr = actual === 0 || d === 0 ? '' : d > 0 ? 'text-blue-600' : 'text-red-500';
                          return <td key={col.key} className={`px-3 py-2 text-right ${clr}`}>{fmt(costSums[col.key])}원</td>;
                        })}
                      </tr>
                      {/* SKU 행 */}
                      {rows.map((r, i) => {
                        const yv = yuanMap[r.sku];
                        const yd = yv != null ? Math.abs(r.unitPriceCny - yv) : 0;
                        const yw = yv != null && yd >= 4;
                        const ratio = r.unitPriceCny > 0 ? Math.round(r.costPerUnit / r.unitPriceCny * 100) / 100 : '-';
                        const bg = i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]';
                        return (
                          <tr key={r.sku} className={`${bg} hover:bg-blue-50/30 transition-colors`}>
                            <td className={`px-3 py-2 font-mono font-semibold sticky left-0 z-10 ${bg}`} style={{ wordBreak:'break-all' }}>{r.sku}</td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-700">{skuShipCount[r.sku] || 0}회</td>
                            <td className="px-3 py-2 text-right">{r.cbmPerUnit}</td>
                            <td className="px-3 py-2" style={{ wordBreak: 'break-word' }}>{r.labelName || r.productName}</td>
                            <td className="px-3 py-2 text-right font-semibold">{r.shippedQty}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${yw ? 'text-red-500 bg-red-50' : ''}`}
                              title={yv != null ? `위안화 정보: ${yv} (차이: ${(r.unitPriceCny - yv).toFixed(2)})` : ''}>
                              {r.unitPriceCny}{yw && <span className="text-xs ml-1">({yv})</span>}
                            </td>
                            <td className="px-3 py-2 text-right">0.7</td>
                            <td className="px-3 py-2 text-right">{r.commission || ''}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 bg-amber-50/50">{fmt(r.costPerUnit)}원</td>
                            <td className="px-3 py-2 text-right font-semibold text-purple-700 bg-purple-50/30">{skuAvgCost[r.sku] ? fmt(skuAvgCost[r.sku]) + '원' : '-'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-[#1a2332]">{ratio}</td>
                            <td className="px-3 py-2 text-right font-semibold text-[#1a2332]">{fmt(Math.round(r.unitPriceRaw * 285))}원</td>
                            {(() => { const d = Math.round(r.unitPriceRaw * 285) - (r.costPerUnit || 0); return (
                              <td className={`px-3 py-2 text-right font-semibold ${d >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{d >= 0 ? '+' : ''}{fmt(d)}원</td>
                            ); })()}
                            {COST_COLS.map(col => <td key={col.key} className="px-3 py-2 text-right">{fmt(r.costs?.[col.key]?.perUnit)}원</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
