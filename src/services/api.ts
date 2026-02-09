import { supabase } from './supabase';

// --- TYPES ---
export interface UserSettings {
  id?: string;
  annual_award_hours: number;
  default_agreement_name: string;
  selected_award?: string;
}

export interface Teacher {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  color?: string;
  employment_type?: string;
  time_fraction?: number; 
  max_hours?: number; 
  trains_online?: boolean;
  is_tae?: boolean;
  availability?: {
    days?: number[];
    schedule?: Record<number, { start: string; end: string; active: boolean }>;
  };
  restricted_subjects?: any;
}

export interface Subject {
  id: string;
  name: string;
  description?: string;
  hours: number; 
}

export interface Course {
  id: string;
  name: string;
  sequenced_subjects?: string[]; 
}

export interface CourseInstance {
  id: string;
  template_id: string;
  user_id?: string;
  name: string; 
  start_date: string;
  end_date: string;
  start_time: string;     
  allowed_days: number[]; 
  hours_per_day: number;  
  break_minutes: number;
  delivery_mode: string;
  status?: string; 
  assignments?: any; 
}

export interface UnitAllocation { id: string; instance_id: string; subject_id: string; teacher_id: string; }

// --- EXPORTED TYPES FOR SETTINGS VIEW ---
export interface TermItem { name: string; start: string; end: string; startDate?: string; endDate?: string; }
export interface HolidayItem { name: string; date: string; }
export interface AcademicYear { id: string; terms: TermItem[]; holidays: HolidayItem[]; }

export const ApiService = {

  // --- GENERIC HELPERS ---
  async getAll<T>(table: string) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data as T[];
  },

  async getById<T>(table: string, id: string) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data as T;
  },

  async delete(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // --- SETTINGS ---
  async getSettings() {
    const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
    return (data as UserSettings) || { annual_award_hours: 800, default_agreement_name: 'MEA 2024' };
  },

  async saveSettings(settings: Partial<UserSettings>) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('user_settings').upsert({
      user_id: user?.id,
      ...settings
    }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return data;
  },

  // --- ACADEMIC YEAR ---
  async getAcademicYear(yearId: string) {
    const { data, error } = await supabase.from('academic_years').select('*').eq('id', yearId).maybeSingle();
    return data || null;
  },

  async saveAcademicYear(yearData: AcademicYear) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('academic_years').upsert({
        ...yearData,
        user_id: user?.id
    }).select().single();
    if (error) throw error;
    return data;
  },

  // --- SUBJECTS ---
  async getSubjects() {
    const { data, error } = await supabase.from('subjects').select('*').order('name');
    if (error) throw error;
    return data as Subject[];
  },

  async createSubject(subject: Partial<Subject>) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...subject, user_id: user?.id };
    const { data, error } = await supabase.from('subjects').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updateSubject(id: string, subject: Partial<Subject>) {
    const { data, error } = await supabase.from('subjects').update(subject).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // --- TEACHERS ---
  async getTeachers() {
    const { data, error } = await supabase.from('teachers').select('*');
    if (error) throw error;
    return data as Teacher[];
  },

  async createTeacher(teacher: Partial<Teacher>) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...teacher, user_id: user?.id };
    const { data, error } = await supabase.from('teachers').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updateTeacher(id: string, teacher: Partial<Teacher>) {
    const { data, error } = await supabase.from('teachers').update(teacher).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteTeacher(id: string) {
    return this.delete('teachers', id);
  },

  async globalClearTeacher(teacherId: string) {
    const { error } = await supabase.from('course_unit_allocations').delete().eq('teacher_id', teacherId);
    if (error) throw error;
    return true;
  },

  // --- COURSES (TEMPLATES) ---
  async createCourse(course: Partial<Course>) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { 
        name: course.name, 
        sequenced_subjects: course.sequenced_subjects || [], 
        user_id: user?.id 
    };
    const { data, error } = await supabase.from('course_templates').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updateCourse(id: string, course: Partial<Course>) {
    const payload = {
        name: course.name,
        sequenced_subjects: course.sequenced_subjects || []
    };
    const { data, error } = await supabase.from('course_templates').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // --- COURSE INSTANCES (CLASSES) ---
  async getCourseInstances() {
    const { data, error } = await supabase.from('course_instances').select(`*, course_templates (name)`);
    if (error) throw error;
    return data;
  },

  async saveCourseInstance(instance: any) {
    const { id, ...data } = instance;
    const { data: { user } } = await supabase.auth.getUser();
    
    const payload: any = { 
        ...data, 
        user_id: user?.id,
        status: data.status || 'active' 
    };
    
    delete payload.days_of_week; 
    delete payload.hours_per_session;
    delete payload.course_template; 
    
    if (id) {
      const { data: updated, error } = await supabase.from('course_instances').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return updated;
    } else {
      const { data: created, error } = await supabase.from('course_instances').insert([payload]).select().single();
      if (error) throw error;
      return created;
    }
  },

  // --- ALLOCATIONS ---
  async getAllocationsGlobal() {
    const { data, error } = await supabase.from('course_unit_allocations').select('*');
    if (error) throw error;
    return data;
  },

  async saveAllocation(allocation: any) {
    const { id, ...data } = allocation;
    if (id) {
       const { data: updated, error } = await supabase.from('course_unit_allocations').update(data).eq('id', id).select().single();
       if (error) throw error;
       return updated;
    } else {
       const { data: created, error } = await supabase.from('course_unit_allocations').insert([data]).select().single();
       if (error) throw error;
       return created;
    }
  },

  // --- BULK UPDATES (FIXED: Respects Part-Time FTE) ---
  async bulkUpdateTeacherLimits(annualHours: number) {
    // 1. Fetch all teachers to know their specific FTE (time_fraction)
    const { data: teachers, error: fetchError } = await supabase
      .from('teachers')
      .select('id, time_fraction');
    
    if (fetchError) throw fetchError;
    if (!teachers || teachers.length === 0) return true;

    // 2. Calculate the correct limit for each person
    const updates = teachers.map(t => {
      // Default to 1.0 (Full Time) if fraction is missing
      const fte = t.time_fraction && t.time_fraction > 0 ? t.time_fraction : 1.0;
      const newLimit = Math.round(annualHours * fte);
      
      return {
        id: t.id,
        max_hours: newLimit
      };
    });

    // 3. Save updates back to database
    const { error: updateError } = await supabase
      .from('teachers')
      .upsert(updates);

    if (updateError) throw updateError;
    return true;
  }
};