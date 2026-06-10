import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function load() {
  try {
    if (fs.existsSync(PATHS.confirmedSkus)) {
      const raw = JSON.parse(fs.readFileSync(PATHS.confirmedSkus, 'utf8'));
      // 기존 배열 형식 → 객체 형식 마이그레이션
      if (Array.isArray(raw)) {
        const obj = {};
        for (const sku of raw) obj[sku] = { confirmedAt: '2026-04-17T00:00:00.000Z' };
        save(obj);
        return obj;
      }
      return raw;
    }
  } catch (e) {}
  return {};
}

function save(data) {
  fs.writeFileSync(PATHS.confirmedSkus, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(request) {
  try {
    const { action, sku, skus } = await request.json();
    const map = load();
    const now = new Date().toISOString();
    if (action === 'confirm') {
      map[sku] = { confirmedAt: now };
    } else if (action === 'confirm-bulk' && Array.isArray(skus)) {
      for (const s of skus) {
        map[s] = { confirmedAt: now };
      }
    } else if (action === 'unconfirm') {
      delete map[sku];
    }
    save(map);
    return NextResponse.json({ success: true, count: Object.keys(map).length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
