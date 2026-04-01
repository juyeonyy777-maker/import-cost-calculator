import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export const PATHS = {
  allData: path.join(DATA_DIR, '전체데이터.json'),
  logs: path.join(DATA_DIR, '사용로그.json'),
  yuanInfo: path.join(DATA_DIR, '위안화 정보.xlsx'),
};
