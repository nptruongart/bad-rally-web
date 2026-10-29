// Kiểu dữ liệu dùng chung cho chế độ Giải đấu (logic thuần, không phụ thuộc PocketBase/React)

// Luật điểm của một nội dung: số set (1 hoặc thắng 2/3), điểm thắng mỗi set, trần điểm
export type ScoringRule = { games: 1 | 3; points: number; cap: number };

// Tỉ số một set: [điểm đôi A, điểm đôi B]
export type GameScore = [number, number];

export type Side = 'a' | 'b';
