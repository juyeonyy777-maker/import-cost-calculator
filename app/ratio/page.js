'use client';

import { useState, useEffect } from 'react';

export default function RatioPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ratio-list')
      .then(r => r.json())
      .then(data => { setList(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalAvg = list.length > 0
    ? Math.round(list.reduce((s, r) => s + r.avg, 0) / list.length * 100) / 100
    : '-';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">출고건별 평균 비율</h1>
        <p className="text-sm text-gray-500 mt-1">전체 {list.length}건 / 전체 평균 <b className="text-red-600 text-lg">{totalAvg}</b></p>
      </header>

      {loading ? (
        <p className="text-gray-500 text-center py-10">로딩중...</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500 text-center py-10">저장된 데이터가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-gray-800 w-12">#</th>
                <th className="px-4 py-3 text-left font-bold text-gray-800">출고건</th>
                <th className="px-4 py-3 text-right font-bold text-gray-800">SKU 수</th>
                <th className="px-4 py-3 text-right font-bold text-red-600">평균 비율</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item, i) => (
                <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-bold">{item.key}</td>
                  <td className="px-4 py-3 text-right">{item.skuCount}개</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 text-lg">{item.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
