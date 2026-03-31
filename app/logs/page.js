'use client';

import { useState, useEffect } from 'react';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/log')
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data.reverse() : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const query = filter.toLowerCase();
  const filtered = query
    ? logs.filter(l =>
        (l.user || '').toLowerCase().includes(query) ||
        (l.action || '').toLowerCase().includes(query) ||
        (l.detail || '').toLowerCase().includes(query) ||
        (l.time || '').toLowerCase().includes(query)
      )
    : logs;

  const actionColor = (action) => {
    if (action === '로그인') return 'bg-green-100 text-green-700';
    if (action === '파일업로드') return 'bg-blue-100 text-blue-700';
    if (action === '원가계산') return 'bg-purple-100 text-purple-700';
    if (action === '자동저장') return 'bg-orange-100 text-orange-700';
    if (action?.includes('EXCEL')) return 'bg-teal-100 text-teal-700';
    if (action === '초기화') return 'bg-gray-100 text-gray-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">사용 로그</h1>
        <p className="text-sm text-gray-500 mt-1">총 {logs.length}건</p>
      </header>

      <div className="mb-4">
        <input
          type="text"
          placeholder="이름, 작업, 내용으로 검색..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-10">로딩중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">로그가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-gray-800 w-44">시간</th>
                <th className="px-4 py-3 text-left font-bold text-gray-800 w-24">이름</th>
                <th className="px-4 py-3 text-left font-bold text-gray-800 w-28">작업</th>
                <th className="px-4 py-3 text-left font-bold text-gray-800">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{log.time}</td>
                  <td className="px-4 py-2 font-bold">{log.user}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${actionColor(log.action)}`}>{log.action}</span>
                  </td>
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
