import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function loadData() {
  try {
    if (fs.existsSync(PATHS.allData)) return JSON.parse(fs.readFileSync(PATHS.allData, 'utf8'));
  } catch (e) {}
  return {};
}

function saveData(data) {
  fs.writeFileSync(PATHS.allData, JSON.stringify(data, null, 2), 'utf8');
}

export async function POST(request) {
  try {
    const { shipmentKey, rows } = await request.json();
    if (!shipmentKey) return NextResponse.json({ error: '출고코드가 없습니다.' }, { status: 400 });

    const allData = loadData();
    allData[shipmentKey] = { rows, savedAt: new Date().toISOString() };
    saveData(allData);

    return NextResponse.json({ success: true, totalShipments: Object.keys(allData).length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    return NextResponse.json(loadData());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
