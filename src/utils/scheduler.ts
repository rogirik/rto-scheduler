import type { CourseInstance, Course, Subject, AcademicYear } from '../services/api';

const MAX_DATE_SEARCH_ITERATIONS = 365 * 3; 

const parseAsUTC = (dateStr: string, timeStr = '00:00') => {
    if (!dateStr) return new Date();
    return new Date(`${dateStr}T${timeStr}:00Z`);
};

// --- HELPER: CHECK HOLIDAYS ---
const isHolidayByStr = (dateStr: string, holidays: any[] = []) => {
    if (!Array.isArray(holidays)) return false;
    return holidays.some((h: any) => h.date === dateStr);
};

// --- HELPER: CHECK TERM DATES (FIXED) ---
// Now supports 'start'/'end' (from your DB) AND 'startDate'/'endDate'
const isWithinTerm = (date: Date, terms: any[] = []) => { 
    if (!Array.isArray(terms)) return false;
    const checkTime = date.getTime(); 
    
    return terms.some((term: any) => { 
        // FIX: Check for both key variations
        const s = term.start || term.startDate;
        const e = term.end || term.endDate;
        
        if (!s || !e) return false;

        const startTime = parseAsUTC(s).getTime(); 
        const endTime = parseAsUTC(e).getTime(); 
        return checkTime >= startTime && checkTime <= endTime; 
    }); 
};

// --- HELPER: CHECK NON-WORKING DAYS ---
const isNonWorkingDay = (date: Date, holidays: any[] = []) => { 
    const dayOfWeek = date.getUTCDay(); 
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    
    if (isHolidayByStr(dateStr, holidays)) return true; 
    if (dayOfWeek === 0) return true; // Sunday default exclusion
    return false; 
};

// --- CORE GENERATOR ENGINE ---
export const generateAllEventsForInstance = (
    instance: CourseInstance, 
    academicYears: AcademicYear[], 
    template: Course | undefined, 
    subjects: Subject[],
    teachers: any[]
) => {
    // 1. Validate Inputs
    const rawTemplate = template as any;
    // Check both snake_case (DB) and camelCase (Legacy)
    const seqSubjects = rawTemplate?.sequenced_subjects || rawTemplate?.sequencedSubjects;

    if (!instance.start_date || !seqSubjects || seqSubjects.length === 0) {
        return [];
    }
    
    const events: any[] = [];
    const allowedDays = instance.allowed_days || [1, 2, 3, 4, 5];
    const hoursPerDay = instance.hours_per_day || 6;
    const startTime = instance.start_time || '09:00';
    const [startHour, startMinute] = startTime.split(':').map(Number);
    
    let currentDate = parseAsUTC(instance.start_date);
    
    // 2. Map Database Years for Quick Lookup
    const yearsMap: Record<string, AcademicYear> = {};
    if (Array.isArray(academicYears)) {
        academicYears.forEach(y => yearsMap[String(y.id)] = y);
    }

    // 3. Iterate through Subjects
    for (const subjectItem of seqSubjects) {
        // Handle if subjectItem is a string ID or an object
        const subjectId = typeof subjectItem === 'string' ? subjectItem : subjectItem.subjectId || subjectItem.id;
        const subject = subjects.find(s => s.id === subjectId);
        
        if (!subject) continue;
        
        let hoursToSchedule = (subject.hours && subject.hours > 0) ? subject.hours : 40;

        while (hoursToSchedule > 0) {
            let sessionDate: Date | null = null;
            let foundRegularDate: Date | null = null;
            let searchDate = new Date(currentDate);

            // 4. Find Next Valid Date
            for (let i = 0; i < MAX_DATE_SEARCH_ITERATIONS; i++) {
                const dayOfWeek = searchDate.getUTCDay(); 
                const y = searchDate.getUTCFullYear();
                const yearData = yearsMap[y.toString()];

                // STRICT CHECK: The calendar will only fill if we find a matching Academic Year
                if (
                    yearData && 
                    yearData.terms && 
                    allowedDays.includes(dayOfWeek) && 
                    isWithinTerm(searchDate, yearData.terms) && 
                    !isNonWorkingDay(searchDate, yearData.holidays || [])
                ) {
                    foundRegularDate = new Date(searchDate);
                    break;
                }
                searchDate.setUTCDate(searchDate.getUTCDate() + 1);
            }

            sessionDate = foundRegularDate;

            if (!sessionDate) break;

            currentDate = new Date(sessionDate);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);

            const hoursThisSession = Math.min(hoursToSchedule, hoursPerDay);
            const start = new Date(sessionDate); 
            start.setUTCHours(startHour, startMinute, 0, 0);
            
            const end = new Date(start); 
            end.setUTCHours(start.getUTCHours() + Math.floor(hoursThisSession), (hoursThisSession % 1) * 60, 0, 0);

            events.push({
                id: `${instance.id}-${subject.id}-${events.length}`,
                instanceId: instance.id,
                subjectId: subject.id,
                start: start,
                end: end,
                summary: subject.name,
                courseName: instance.name,
                hours: hoursThisSession
            });

            hoursToSchedule -= hoursThisSession;
        }
    }
    return events;
};