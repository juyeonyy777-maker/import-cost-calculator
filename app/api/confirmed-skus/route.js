import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function load() {
  try {
    if (fs.existsSync(PATHS.confirmedSkus)) return JSON.parse(fs.readFileSync(PATHS.confirmedSkus, 'utf8'));
  } catch (e) {}
  return [];
}

function save(data) {
  fs.writeFileSync(PATHS.confirmedSkus, JSON.stringify(data), 'utf8');
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(request) {
  try {
    const { action, sku } = await request.json();
    const list = load();
    if (action === 'confirm' && !list.includes(sku)) {
      list.push(sku);
    } else if (action === 'unconfirm') {
      const idx = list.indexOf(sku);
      if (idx >= 0) list.splice(idx, 1);
    }
    save(list);
    return NextResponse.json({ success: true, count: list.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
