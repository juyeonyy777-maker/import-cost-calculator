import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_PATH = path.resolve('C:/Users/user/Desktop/클로드 전용 260320/전체데이터.json');

export async function GET() {
  try {
    let allData = {};
    if (fs.existsSync(DATA_PATH)) {
      allData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }

    const list = [];
    for (const [key, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      const ratios = [];
      for (const r of entry.rows) {
        if (r.unitPriceCny > 0 && r.costPerUnit > 0) {
          ratios.push(r.costPerUnit / r.unitPriceCny);
        }
      }
      if (ratios.length > 0) {
        list.push({
          key,
          avg: Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length * 100) / 100,
          skuCount: entry.rows.length,
          savedAt: entry.savedAt || '',
        });
      }
    }

    // 날짜순 정렬 (최신 먼저)
    list.sort((a, b) => {
      const da = (a.key.match(/\d{6}/) || ['0'])[0];
      const db = (b.key.match(/\d{6}/) || ['0'])[0];
      return parseInt(db) - parseInt(da);
    });

    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
