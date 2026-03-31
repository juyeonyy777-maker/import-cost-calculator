import { NextResponse } from 'next/server';
import { parseExcel } from '@/lib/parsers/excel-parser';
import { parseInvoicePdf } from '@/lib/parsers/invoice-parser';
import { parseDeclarationPdf } from '@/lib/parsers/declaration-parser';
import { calculateImportCosts } from '@/lib/calculator';
import path from 'path';
import fs from 'fs';

export async function POST(request) {
  try {
    const formData = await request.formData();

    const excelFile = formData.get('excel');
    const excelFile2 = formData.get('excel2');
    const invoiceFile = formData.get('invoice');
    const declarationFile = formData.get('declaration');
    const exchangeRateInput = formData.get('exchangeRate');

    if (!excelFile) {
      return NextResponse.json({ error: '출고내역 Excel 파일이 필요합니다.' }, { status: 400 });
    }

    // 파일 형식 검증
    const XLSX_VAL = require('xlsx');

    // 결제명세서 검증
    const excelBuf1 = Buffer.from(await excelFile.arrayBuffer());
    try {
      const wb1 = XLSX_VAL.read(excelBuf1, { type: 'buffer' });
      const data1 = XLSX_VAL.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 });
      const headers1 = data1.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
      const required1 = ['SKU', '단가', '총금액', '환율'];
      const missing1 = required1.filter(k => !headers1.includes(k));
      if (missing1.length > 0) {
        return NextResponse.json({ error: `결제명세서 형식이 맞지 않습니다.\n필수 항목 누락: ${missing1.join(', ')}\n올바른 결제명세서 파일인지 확인해주세요.` }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: `결제명세서 파일을 읽을 수 없습니다: ${e.message}` }, { status: 400 });
    }

    // 출고내역 검증
    if (excelFile2 && excelFile2.size > 0) {
      const buf2check = Buffer.from(await excelFile2.arrayBuffer());
      try {
        const wb2 = XLSX_VAL.read(buf2check, { type: 'buffer' });
        const data2 = XLSX_VAL.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
        const headers2 = data2.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
        const required2 = ['SKU', '출고수량'];
        const missing2 = required2.filter(k => !headers2.includes(k));
        if (missing2.length > 0) {
          return NextResponse.json({ error: `출고내역 형식이 맞지 않습니다.\n필수 항목 누락: ${missing2.join(', ')}\n올바른 출고내역 파일인지 확인해주세요.` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `출고내역 파일을 읽을 수 없습니다: ${e.message}` }, { status: 400 });
      }
    }

    // 청구서 PDF 검증
    if (invoiceFile && invoiceFile.size > 0) {
      const invBufCheck = Buffer.from(await invoiceFile.arrayBuffer());
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const invPdf = await pdfParse(invBufCheck);
        const invText = invPdf.text || '';
        const required3 = ['KRW', 'TOTAL'];
        const missing3 = required3.filter(k => !invText.toUpperCase().includes(k));
        if (missing3.length > 0) {
          return NextResponse.json({ error: `청구서 PDF 형식이 맞지 않습니다.\n필수 항목 누락: ${missing3.join(', ')}\n올바른 CNINSIDER 청구서인지 확인해주세요.` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `청구서 PDF를 읽을 수 없습니다: ${e.message}` }, { status: 400 });
      }
    }

    // Parse Excel
    const excelBuffer = excelBuf1;
    const excelData = parseExcel(excelBuffer);

    // Parse Excel 2 (출고내역) — 수량 + 상자번호 기반 개당 CBM 계산
    if (excelFile2 && excelFile2.size > 0) {
      const excel2Buffer = Buffer.from(await excelFile2.arrayBuffer());
      const excel2Data = parseExcel(excel2Buffer);

      // 1) SKU별 수량: 세트수량 > 0이면 세트수량, 아니면 출고수량
      const qtyMap = {};
      for (const item of excel2Data.rawItems) {
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!qtyMap[item.sku]) qtyMap[item.sku] = 0;
        qtyMap[item.sku] += qty;
      }

      // 2) 상자번호별 CBM과 총 수량 계산
      const boxMap = {}; // boxNo -> { cbm, totalQty }
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        if (!box) continue;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!boxMap[box]) {
          boxMap[box] = { cbm: item.boxCbm || item.cbm || 0, totalQty: 0 };
        }
        boxMap[box].totalQty += qty;
        // CBM은 박스 첫 아이템에서 가져오되, 더 큰 값이 있으면 갱신
        if ((item.boxCbm || item.cbm || 0) > boxMap[box].cbm) {
          boxMap[box].cbm = item.boxCbm || item.cbm || 0;
        }
      }

      // 3) SKU별 개당 CBM 계산 (각 박스에서 개당CBM = boxCBM / 박스총수량)
      const skuCbmTotal = {}; // sku -> 총 CBM 합
      const skuQtyTotal = {}; // sku -> 총 수량 합
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!box || !boxMap[box] || boxMap[box].totalQty === 0) continue;
        const cbmPerUnitInBox = boxMap[box].cbm / boxMap[box].totalQty;
        if (!skuCbmTotal[item.sku]) skuCbmTotal[item.sku] = 0;
        if (!skuQtyTotal[item.sku]) skuQtyTotal[item.sku] = 0;
        skuCbmTotal[item.sku] += cbmPerUnitInBox * qty;
        skuQtyTotal[item.sku] += qty;
      }

      // 4) excelData에 수량과 CBM 덮어쓰기
      let newTotalQty = 0;
      let newTotalCbm = 0;
      for (const item of excelData.items) {
        if (qtyMap[item.sku] !== undefined) {
          item.shippedQty = qtyMap[item.sku];
        }
        if (skuCbmTotal[item.sku] !== undefined && skuQtyTotal[item.sku] > 0) {
          item.totalCbm = skuCbmTotal[item.sku];
        }
        newTotalQty += item.shippedQty;
        newTotalCbm += item.totalCbm || 0;
      }
      excelData.totals.totalQty = newTotalQty;
      excelData.totals.totalCbm = newTotalCbm;
      excelData.boxCount2 = excel2Data.boxCount;
    }

    // Parse Invoice PDF (optional)
    let invoiceData = null;
    if (invoiceFile && invoiceFile.size > 0) {
      const pdfParse = (await import('pdf-parse')).default;
      const invoiceBuffer = Buffer.from(await invoiceFile.arrayBuffer());
      const invoicePdf = await pdfParse(invoiceBuffer);
      invoiceData = parseInvoicePdf(invoicePdf.text);
    }

    // Parse Declaration PDF (optional)
    let declarationData = null;
    if (declarationFile && declarationFile.size > 0) {
      const pdfParse = (await import('pdf-parse')).default;
      const declBuffer = Buffer.from(await declarationFile.arrayBuffer());
      const declPdf = await pdfParse(declBuffer);
      declarationData = parseDeclarationPdf(declPdf.text);
    }

    // Exchange rate priority: user input > auto-extracted
    const exchangeRateCNY = exchangeRateInput ? parseFloat(exchangeRateInput) : 0;

    // Calculate import costs
    const result = calculateImportCosts({
      excelData,
      invoiceData,
      declarationData,
      exchangeRateCNY,
    });

    // 위안화 정보 엑셀에서 SKU → 위안화 매핑 로드
    let yuanMap = {};
    try {
      const yuanPath = path.resolve('C:/Users/user/Desktop/클로드 전용 260320/위안화 정보.xlsx');
      console.log('[위안화] 경로:', yuanPath, '존재:', fs.existsSync(yuanPath));
      if (fs.existsSync(yuanPath)) {
        const XLSX = require('xlsx');
        const buf = fs.readFileSync(yuanPath);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        for (let i = 1; i < sheet.length; i++) {
          const sku = sheet[i][5];  // 바코드 (F열)
          const yuan = sheet[i][8]; // 위안화 (I열)
          if (sku && yuan != null) yuanMap[String(sku)] = Number(yuan);
        }
        console.log('[위안화] 로드 완료:', Object.keys(yuanMap).length, '개 SKU');
      }
    } catch (e) {
      console.error('[위안화] 로드 실패:', e.message);
    }

    // 전체 저장 데이터에서 SKU별 원가평균 + 최근 5건 평균 위안화 비율 계산
    let skuAvgCost = {};
    let recent5AvgRatio = null;
    try {
      const dataPath = path.resolve('C:/Users/user/Desktop/클로드 전용 260320/전체데이터.json');
      if (fs.existsSync(dataPath)) {
        const allData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const skuCosts = {};
        for (const [, entry] of Object.entries(allData)) {
          if (!entry.rows) continue;
          for (const r of entry.rows) {
            if (!r.sku || !r.costPerUnit) continue;
            if (!skuCosts[r.sku]) skuCosts[r.sku] = [];
            skuCosts[r.sku].push(r.costPerUnit);
          }
        }
        for (const [sku, costs] of Object.entries(skuCosts)) {
          skuAvgCost[sku] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length);
        }

        // 최근 5건 평균 위안화 비율 (출고코드 날짜순 정렬)
        const shipments = Object.entries(allData)
          .map(([key, entry]) => {
            const dateMatch = key.match(/AE(\d{6})/);
            const dateNum = dateMatch ? parseInt(dateMatch[1]) : 0;
            return { key, dateNum, rows: entry.rows || [] };
          })
          .filter(s => s.dateNum > 0)
          .sort((a, b) => b.dateNum - a.dateNum)
          .slice(0, 5);

        const allRatios = [];
        const recent5Detail = [];
        for (const s of shipments) {
          const ratios = [];
          for (const r of s.rows) {
            if (r.unitPriceCny > 0 && r.costPerUnit > 0) {
              const ratio = r.costPerUnit / r.unitPriceCny;
              allRatios.push(ratio);
              ratios.push(ratio);
            }
          }
          if (ratios.length > 0) {
            recent5Detail.push({
              key: s.key,
              avg: Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100) / 100,
            });
          }
        }
        if (allRatios.length > 0) {
          recent5AvgRatio = Math.round(allRatios.reduce((s, r) => s + r, 0) / allRatios.length * 100) / 100;
          recent5AvgRatio = { avg: recent5AvgRatio, detail: recent5Detail };
        }
      }
    } catch (e) {
      console.error('[원가평균] 로드 실패:', e.message);
    }

    return NextResponse.json({
      success: true,
      data: result,
      yuanMap,
      skuAvgCost,
      recent5AvgRatio,
      parsed: {
        excel: { itemCount: excelData.items.length, totals: excelData.totals, boxCount: excelData.boxCount, boxCount2: excelData.boxCount2, shipmentCode: excelData.shipmentCode },
        invoice: invoiceData ? {
          blNo: invoiceData.blNo,
          cbm: invoiceData.cbm,
          weight: invoiceData.weight,
          packages: invoiceData.packages,
          costs: invoiceData.costs,
          exchangeRateCNY: invoiceData.exchangeRateCNY,
          totalAmount: invoiceData.totalAmount,
          totalVat: invoiceData.totalVat,
        } : null,
        declaration: declarationData ? {
          declarationNo: declarationData.declarationNo,
          blNo: declarationData.blNo,
          exchangeRate: declarationData.exchangeRate,
          totalCustomsDuty: declarationData.totalCustomsDuty,
          totalVat: declarationData.totalVat,
          itemCount: declarationData.items.length,
        } : null,
      },
    });
  } catch (error) {
    console.error('Calculation error:', error);
    return NextResponse.json(
      { error: `계산 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
