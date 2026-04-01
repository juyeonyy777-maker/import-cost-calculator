'use client';

import { useState, useEffect } from 'react';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/log').then(r => r.json()).then(d => { setLogs(Array.isArray(d) ? d.reverse() : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const q = filter.toLowerCase();
  const filtered = q ? logs.filter(l => [l.user, l.action, l.detail, l.time].some(v => (v || '').toLowerCase().includes(q))) : logs;

  const colorMap = { '로그인': 'bg-green-100 text-green-700', '파일업로드': 'bg-blue-100 text-blue-700', '원가계산': 'bg-purple-100 text-purple-700', '자동저장': 'bg-orange-100 text-orange-700', '초기화': 'bg-gray-100 text-gray-700' };
  const getColor = (a) => (a?.includes('EXCEL') ? 'bg-teal-100 text-teal-700' : colorMap[a] || 'bg-gray-100 text-gray-700');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">사용 로그</h1>
        <p className="text-sm text-gray-500 mt-1">총 {logs.length}건</p>
      </header>

      <div className="mb-4">
        <input type="text" placeholder="이름, 작업, 내용 검색..." value={filter} onChange={e => setFilter(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loading ? <p className="text-gray-500 text-center py-10">로딩중...</p> : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">로그 없음</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-bold w-44">시간</th>
                <th className="px-4 py-3 text-left font-bold w-24">이름</th>
                <th className="px-4 py-3 text-left font-bold w-28">작업</th>
                <th className="px-4 py-3 text-left font-bold">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{log.time}</td>
                  <td className="px-4 py-2 font-bold">{log.user}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${getColor(log.action)}`}>{log.action}</span></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
