import type { CourseInstance, Course, Subject, AcademicYear } from '../services/api';

const MAX_DATE_SEARCH_ITERATIONS = 365 * 3; 

// THE FIX: Parses dates strictly in the user's local timezone (No 'Z' Zulu/UTC overrides)
const parseAsLocal = (dateStr: string, timeStr = '00:00') => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    // Month is 0-indexed in JS dates
    return new Date(y, m - 1, d, h, min, 0);
};

// --- HELPER: CHECK HOLIDAYS ---
const isHolidayByStr = (dateStr: string, holidays: any[] = []) => {
    if (!Array.isArray(holidays)) return false;
    return holidays.some((h: any) => h.date === dateStr);
};

// --- HELPER: CHECK TERM DATES ---
const isWithinTerm = (date: Date, terms: any[] = []) => { 
    if (!Array.isArray(terms)) return false;
    const checkTime = date.getTime(); 
    
    return terms.some((term: any) => { 
        const s = term.start || term.startDate;
        const e = term.end || term.endDate;
        
        if (!s || !e) return false;

        const startTime = parseAsLocal(s).getTime(); 
        const endTime = parseAsLocal(e, '23:59').getTime(); // End of the day
        return checkTime >= startTime && checkTime <= endTime; 
    }); 
};

// --- HELPER: CHECK NON-WORKING DAYS ---
const isNonWorkingDay = (date: Date, holidays: any[] = []) => { 
    const dayOfWeek = date.getDay(); // Local day
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
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
    const seqSubjects = rawTemplate?.sequenced_subjects || rawTemplate?.sequencedSubjects;

    if (!instance.start_date || !seqSubjects || seqSubjects.length === 0) {
        return [];
    }
    
    const events: any[] = [];
    const allowedDays = instance.allowed_days || [1, 2, 3, 4, 5];
    const hoursPerDay = instance.hours_per_day || 6;
    const startTime = instance.start_time || '09:00';
    const [startHour, startMinute] = startTime.split(':').map(Number);
    
    let currentDate = parseAsLocal(instance.start_date, startTime);
    
    // 2. Map Database Years for Quick Lookup
    const yearsMap: Record<string, AcademicYear> = {};
    if (Array.isArray(academicYears)) {
        academicYears.forEach(y => yearsMap[String(y.id)] = y);
    }

    // 3. Iterate through Subjects
    for (const subjectItem of seqSubjects) {
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
                const dayOfWeek = searchDate.getDay(); // Local Day
                const y = searchDate.getFullYear();    // Local Year
                const yearData = yearsMap[y.toString()];

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
                // Step forward strictly by 1 local day
                searchDate.setDate(searchDate.getDate() + 1);
            }

            sessionDate = foundRegularDate;

            if (!sessionDate) break;

            currentDate = new Date(sessionDate);
            currentDate.setDate(currentDate.getDate() + 1);

            const hoursThisSession = Math.min(hoursToSchedule, hoursPerDay);
            
            // Set strictly local time bounds
            const start = new Date(sessionDate); 
            start.setHours(startHour, startMinute, 0, 0);
            
            const end = new Date(start); 
            end.setHours(start.getHours() + Math.floor(hoursThisSession), start.getMinutes() + ((hoursThisSession % 1) * 60), 0, 0);

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
