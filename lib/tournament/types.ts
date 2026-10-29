// Kiểu dữ liệu dùng chung cho chế độ Giải đấu (logic thuần, không phụ thuộc PocketBase/React)

// Luật điểm của một nội dung: số set (1 hoặc thắng 2/3), điểm thắng mỗi set, trần điểm
export type ScoringRule = { games: 1 | 3; points: number; cap: number };

// Tỉ số một set: [điểm đôi A, điểm đôi B]
export type GameScore = [number, number];

export type Side = 'a' | 'b';

// Kết quả một trận đã xong (a/b là id đôi); walkover = thắng xử ép
export type ResultInput = { a: string; b: string; scores: GameScore[]; winner: Side; walkover?: boolean };

export type StandingRow = {
  entry: string;
  played: number;
  won: number;
  lost: number;
  gameDiff: number;
  pointDiff: number;
  rank: number;
  byLot: boolean; // thứ hạng quyết định bằng bốc thăm
};

// 'walkover': đôi bỏ cuộc thua xử ép các trận còn lại; 'bwf': xóa mọi kết quả của đôi bỏ cuộc (BWF 16.2)
export type WalkoverMode = 'walkover' | 'bwf';
