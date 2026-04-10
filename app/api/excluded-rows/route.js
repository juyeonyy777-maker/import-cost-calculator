import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function loadExcluded() {
  try {
    if (fs.existsSync(PATHS.excludedRows)) return JSON.parse(fs.readFileSync(PATHS.excludedRows, 'utf8'));
  } catch (e) {}
  return {};
}

function saveExcluded(data) {
  fs.writeFileSync(PATHS.excludedRows, JSON.stringify(data, null, 2), 'utf8');
}

// GET: 제외 목록 조회 { key: { memo } }
export async function GET() {
  const data = loadExcluded();
  // 이전 배열 형식 호환
  if (Array.isArray(data)) {
    const obj = {};
    for (const k of data) obj[k] = { memo: '' };
    saveExcluded(obj);
    return NextResponse.json(obj);
  }
  return NextResponse.json(data);
}

// POST: 제외/복원/메모
export async function POST(request) {
  try {
    const { action, items, memo } = await request.json();
    const excluded = loadExcluded();
    // 이전 배열 형식 호환
    const data = Array.isArray(excluded) ? Object.fromEntries(excluded.map(k => [k, { memo: '' }])) : excluded;

    if (action === 'exclude') {
      for (const item of items) {
        const key = `${item.sku}__${item.shipmentKey}`;
        data[key] = { ...data[key], excluded: true, memo: data[key]?.memo || '' };
      }
    } else if (action === 'restore') {
      for (const item of items) {
        const key = `${item.sku}__${item.shipmentKey}`;
        if (data[key]?.memo) { data[key] = { excluded: false, memo: data[key].memo }; }
        else { delete data[key]; }
      }
    } else if (action === 'memo') {
      for (const item of items) {
        const key = `${item.sku}__${item.shipmentKey}`;
        if (!data[key]) data[key] = { excluded: false, memo: '' };
        data[key].memo = memo || '';
      }
    }

    saveExcluded(data);
    return NextResponse.json({ success: true, count: Object.keys(data).length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
