import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

export async function GET() {
  try {
    let allData = {};
    if (fs.existsSync(PATHS.allData)) {
      allData = JSON.parse(fs.readFileSync(PATHS.allData, 'utf8'));
    }

    const list = [];
    for (const [key, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      let totalCost = 0, totalRaw = 0;
      for (const r of entry.rows) {
        if (r.unitPriceRaw > 0 && r.costPerUnit > 0) {
          totalCost += r.costPerUnit * r.shippedQty;
          totalRaw += r.unitPriceRaw * r.shippedQty;
        }
      }
      if (totalRaw > 0) {
        list.push({
          key,
          avg: Math.round(totalCost / totalRaw * 100) / 100,
          skuCount: entry.rows.length,
          savedAt: entry.savedAt || '',
        });
      }
    }

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
