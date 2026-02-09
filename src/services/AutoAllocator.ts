import { ApiService } from './api';
import { supabase } from './supabase'; 
import type { CourseInstance, Teacher, UnitAllocation, Subject, Course } from './api'; 
import { areIntervalsOverlapping, parseISO } from 'date-fns';

// --- HELPER: Time Overlap Check ---
const doTimesOverlap = (start1: string, hours1: number, start2: string, hours2: number) => {
  const s1 = parseInt(start1.replace(':', ''), 10);
  const e1 = s1 + (hours1 * 100); 
  const s2 = parseInt(start2.replace(':', ''), 10);
  const e2 = s2 + (hours2 * 100);
  return s1 < e2 && s2 < e1;
};

export const AutoAllocator = {
  
  // --- MASTER FUNCTION: UI ENTRY POINT ---
  // This is the function your button calls. It prepares the data and runs the complex logic.
  async runAllocation(instanceId: string): Promise<{ allocated: number; conflicts: number }> {
    console.log("Starting Auto-Allocation for:", instanceId);

    // 1. Fetch Fresh Data
    const instance = await ApiService.getById<CourseInstance>('course_instances', instanceId);
    if (!instance) throw new Error("Course instance not found");

    const templates = await ApiService.getAll<any>('course_templates'); // Type 'any' to access sequenced_subjects safely
    const template = templates.find(t => t.id === instance.template_id);
    
    if (!template || !Array.isArray(template.sequenced_subjects)) {
        console.warn("No template or sequenced subjects found.");
        return { allocated: 0, conflicts: 0 };
    }

    // 2. Get Real Subjects from IDs
    const allSubjects = await ApiService.getAll<Subject>('subjects');
    const subjectMap = new Map(allSubjects.map(s => [s.id, s]));
    
    // Convert IDs to Subject Objects
    const subjectsToAssign = template.sequenced_subjects
        .map((id: string) => subjectMap.get(id))
        .filter((s: Subject | undefined): s is Subject => !!s);

    // 3. Filter out subjects that are ALREADY assigned
    const existingAllocations = await ApiService.getAllocationsGlobal();
    const instanceAllocations = existingAllocations.filter(a => a.instance_id === instanceId);
    const assignedIds = new Set(instanceAllocations.map(a => a.subject_id));
    
    const unassignedSubjects = subjectsToAssign.filter(s => !assignedIds.has(s.id));

    if (unassignedSubjects.length === 0) {
        return { allocated: 0, conflicts: 0 };
    }

    // 4. Run the Core Logic
    const result = await this.generateAllocations(instance, unassignedSubjects);

    // 5. Save Results to Database
    for (const alloc of result.newAllocations) {
        await ApiService.saveAllocation({
            ...alloc,
            status: 'confirmed'
        });
    }

    return { 
        allocated: result.newAllocations.length, 
        conflicts: result.skippedSubjects.length 
    };
  },

  // --- CORE LOGIC: SINGLE ALLOCATION ---
  async generateAllocations(targetInstance: CourseInstance, subjectsToAssign: Subject[]) {
    const { data: allocData } = await supabase.from('course_unit_allocations').select('*');
    const allAllocationsGlobal = (allocData || []) as UnitAllocation[];

    const [allTeachers, allInstances] = await Promise.all([
      ApiService.getAll<Teacher>('teachers'),
      ApiService.getCourseInstances()
    ]);
    
    // Filter broken instances to prevent crashes
    const validInstances = (allInstances as CourseInstance[]).filter(i => i.start_date && i.end_date);

    const newAllocations: Partial<UnitAllocation>[] = [];
    const skippedSubjects: { subject: string, reason: string }[] = [];
    const workingAllocations = [...allAllocationsGlobal];

    for (const subject of subjectsToAssign) {
      const bestTeacher = this.findBestTeacher(
          targetInstance, 
          subject, 
          allTeachers, 
          workingAllocations, 
          validInstances
      );

      if (bestTeacher) {
        const alloc: UnitAllocation = {
          id: `temp-${Date.now()}-${subject.id}`, // Temp ID for internal tracking
          instance_id: targetInstance.id,
          subject_id: subject.id,
          teacher_id: bestTeacher.id,
          status: 'confirmed'
        };
        newAllocations.push(alloc);
        workingAllocations.push(alloc);
      } else {
        skippedSubjects.push({ subject: subject.name, reason: 'No available teachers' });
      }
    }

    return { newAllocations, skippedSubjects };
  },


  // --- CORE LOGIC: FIND TEACHER ---
  findBestTeacher(
    instance: CourseInstance, 
    subject: Subject, 
    allTeachers: Teacher[], 
    currentAllocations: UnitAllocation[], 
    allInstances: CourseInstance[]
  ): Teacher | null {
    
    // Sort teachers by current workload (Least Loaded -> Most Loaded)
    const sortedTeachers = [...allTeachers].sort((a, b) => {
        const loadA = this.calculateCurrentLoad(a.id, currentAllocations);
        const loadB = this.calculateCurrentLoad(b.id, currentAllocations);
        // Safety check for missing max_hours
        const maxA = a.max_weekly_hours || 40; 
        const maxB = b.max_weekly_hours || 40;
        const ratioA = loadA / maxA;
        const ratioB = loadB / maxB;
        return ratioA - ratioB;
    });

    for (const teacher of sortedTeachers) {
      // 1. DELIVERY MODE (Assuming property exists, if not, skip check)
      // if (instance.delivery_mode === 'Online' && !teacher.trains_online) continue;

      // 2. RESTRICTED SUBJECTS (Assuming property exists)
      // if (teacher.restricted_subjects && teacher.restricted_subjects.includes(subject.name)) continue;

      // 3. AWARD LIMITS
      const load = this.calculateCurrentLoad(teacher.id, currentAllocations);
      const maxHours = teacher.max_weekly_hours || 40;
      if (load + subject.nominal_hours > maxHours) continue;

      // 4. TIME CLASHES
      if (this.hasTimeClash(teacher.id, instance, currentAllocations, allInstances)) continue;

      return teacher;
    }

    return null;
  },


  // --- HELPER: Load Calculation ---
  calculateCurrentLoad(teacherId: string, allAllocations: UnitAllocation[]) {
    const count = allAllocations.filter(a => a.teacher_id === teacherId).length;
    return count * 40; // Estimated 40hrs per unit
  },


  // --- HELPER: Time Clash Check ---
  hasTimeClash(teacherId: string, targetInstance: CourseInstance, allAllocations: UnitAllocation[], allInstances: CourseInstance[]) {
    // GUARD CLAUSE: If the target instance has no dates, it can't clash.
    if (!targetInstance.start_date || !targetInstance.end_date) return false;

    const teacherAllocs = allAllocations.filter(a => a.teacher_id === teacherId);
    const uniqueInstanceIds = [...new Set(teacherAllocs.map(a => a.instance_id))];

    for (const existingId of uniqueInstanceIds) {
      if (existingId === targetInstance.id) continue; 

      const existingInstance = allInstances.find(i => i.id === existingId);
      
      // GUARD CLAUSE: If the existing instance has no dates, skip it.
      if (!existingInstance || !existingInstance.start_date || !existingInstance.end_date) continue;

      // A. Date Overlap
      const overlapDates = areIntervalsOverlapping(
        { start: parseISO(targetInstance.start_date), end: parseISO(targetInstance.end_date) },
        { start: parseISO(existingInstance.start_date), end: parseISO(existingInstance.end_date) }
      );
      if (!overlapDates) continue;

      // B. Day Overlap
      const days1 = targetInstance.days_of_week || [];
      const days2 = existingInstance.days_of_week || [];
      const overlapDays = days1.some(d => days2.includes(d));
      if (!overlapDays) continue;

      // C. Time Overlap
      const t1Start = targetInstance.start_time || '09:00';
      const t2Start = existingInstance.start_time || '09:00';
      
      if (doTimesOverlap(
          t1Start, targetInstance.hours_per_session || 6, 
          t2Start, existingInstance.hours_per_session || 6
      )) {
        return true; 
      }
    }

    return false;
  }
};