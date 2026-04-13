import type { CourseInstance, Course, Subject, AcademicYear } from '../services/api';

const MAX_DATE_SEARCH_ITERATIONS = 365 * 3; 

const parseAsLocal = (dateStr: string, timeStr = '09:00') => {
    if (!dateStr) return new Date();
    const cleanDate = dateStr.split('T')[0]; 
    const [y, m, d] = cleanDate.split('-').map(Number);
    const safeTime = timeStr || '09:00';
    const [h, min] = safeTime.split(':').map(Number);
    return new Date(y, m - 1, d, h || 0, min || 0, 0);
};

// HELPER: Get clean YYYY-MM-DD string for exact matching
const getLocalIsoString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const IGNORED_TERM_PREFIXES = ['NSW -', 'QLD -', 'WA -', 'SA -', 'TAS -', 'NT -', 'ACT -'];
const IGNORED_HOLIDAY_TAGS = ['(NSW)', '(QLD)', '(WA)', '(SA)', '(TAS)', '(NT)', '(ACT)'];

const isHolidayByStr = (dateStr: string, holidays: any[] = []) => {
    if (!Array.isArray(holidays)) return false;
    const applicableHolidays = holidays.filter(h => {
        const name = h.name || '';
        return !IGNORED_HOLIDAY_TAGS.some(tag => name.includes(tag));
    });
    return applicableHolidays.some((h: any) => h.date === dateStr);
};

const isWithinTerm = (date: Date, terms: any[] = []) => { 
    if (!Array.isArray(terms)) return false;
    const checkTime = date.getTime(); 
    const applicableTerms = terms.filter(term => {
        const name = term.name || '';
        return !IGNORED_TERM_PREFIXES.some(prefix => name.startsWith(prefix));
    });
    return applicableTerms.some((term: any) => { 
        const s = term.start || term.startDate;
        const e = term.end || term.endDate;
        if (!s || !e) return false;
        const startTime = parseAsLocal(s).getTime(); 
        const endTime = parseAsLocal(e, '23:59').getTime(); 
        return checkTime >= startTime && checkTime <= endTime; 
    }); 
};

const isNonWorkingDay = (date: Date, holidays: any[] = []) => { 
    const dayOfWeek = date.getDay(); 
    const dateStr = getLocalIsoString(date);
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
    teachers: any[],
    scheduleOverrides: any[] = [] // NEW: Added optional overrides table parameter
) => {
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
    
    const yearsMap: Record<string, AcademicYear> = {};
    if (Array.isArray(academicYears)) {
        academicYears.forEach(y => yearsMap[String(y.id)] = y);
    }

    // --- NEW: Compile Master Override Lists ---
    // Safely parse the instance JSONB fields (in case they are stored as strings)
    const safeParse = (data: any) => Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data || '[]') : []);
    
    const manualAdds = [
        ...safeParse(instance.additional_dates),
        ...scheduleOverrides.filter(o => o.action_type === 'add' && o.instance_id === instance.id).map(o => o.override_date)
    ];

    const manualRemoves = [
        ...safeParse(instance.excluded_dates),
        ...scheduleOverrides.filter(o => o.action_type === 'remove' && o.instance_id === instance.id).map(o => o.override_date)
    ];

    for (const subjectItem of seqSubjects) {
        const subjectId = typeof subjectItem === 'string' ? subjectItem : subjectItem.subjectId || subjectItem.id;
        const subject = subjects.find(s => s.id === subjectId);
        
        if (!subject) continue;
        
        let hoursToSchedule = (subject.hours && subject.hours > 0) ? subject.hours : 40;

        while (hoursToSchedule > 0) {
            let sessionDate: Date | null = null;
            let foundRegularDate: Date | null = null;
            let searchDate = new Date(currentDate);

            for (let i = 0; i < MAX_DATE_SEARCH_ITERATIONS; i++) {
                const dayOfWeek = searchDate.getDay(); 
                const y = searchDate.getFullYear();    
                const yearData = yearsMap[y.toString()];
                const dateStr = getLocalIsoString(searchDate);

                // 1. Is this date explicitly banned?
                if (manualRemoves.includes(dateStr)) {
                    searchDate.setDate(searchDate.getDate() + 1);
                    continue; // Skip immediately
                }

                // 2. Is this date explicitly forced OR a valid regular date?
                if (
                    manualAdds.includes(dateStr) || // Forced dates bypass term/holiday checks entirely
                    (
                        yearData && 
                        allowedDays.includes(dayOfWeek) && 
                        isWithinTerm(searchDate, yearData.terms || []) && 
                        !isNonWorkingDay(searchDate, yearData.holidays || [])
                    )
                ) {
                    foundRegularDate = new Date(searchDate);
                    break;
                }
                
                searchDate.setDate(searchDate.getDate() + 1);
            }

            sessionDate = foundRegularDate;

            if (!sessionDate) break;

            currentDate = new Date(sessionDate);
            currentDate.setDate(currentDate.getDate() + 1);

            const hoursThisSession = Math.min(hoursToSchedule, hoursPerDay);
            
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