import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_PATH = path.resolve('C:/Users/user/Desktop/클로드 전용 260320/전체데이터.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// POST: 저장
export async function POST(request) {
  try {
    const { shipmentKey, rows } = await request.json();
    if (!shipmentKey) {
      return NextResponse.json({ error: '출고코드가 없습니다.' }, { status: 400 });
    }

    const allData = loadData();
    allData[shipmentKey] = { rows, savedAt: new Date().toISOString() };
    saveData(allData);

    return NextResponse.json({ success: true, totalShipments: Object.keys(allData).length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: 조회
export async function GET() {
  try {
    const allData = loadData();
    return NextResponse.json(allData);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
