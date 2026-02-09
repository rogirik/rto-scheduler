export interface Subject {
  id: string;
  user_id: string;
  name: string;
  description: string;
  hours: number;
}

export interface Teacher {
  id: string;
  user_id: string;
  name: string;
  email: string;
  color: string;
  employment_type: 'Full-time' | 'Part-time' | 'Casual';
  max_hours: number;
  is_tae: boolean;
  trains_online: boolean;
  availability: Record<string, { start: string; end: string }>;
  restricted_subjects: string[];
}

export type ViewState = 'subjects' | 'teachers' | 'courses' | 'calendar' | 'settings';