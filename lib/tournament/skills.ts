// Thang trình độ dùng chung với chế độ vãng lai (giữ khớp với ALL_SKILLS trong app/page.tsx)
export const SKILLS = ['Mới chơi', 'Yếu-', 'Yếu', 'Yếu+', 'Trung bình-', 'Trung bình', 'Trung bình+', 'Khá-', 'Khá', 'Khá+'] as const;
export const skillRank = (s: string) => Math.max(0, SKILLS.indexOf(s as (typeof SKILLS)[number]));
