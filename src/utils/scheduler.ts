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

const getLocalIsoString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// --- THE FIX: Universal Date Normalizer ---
// Converts DD/MM/YYYY, YYYY/MM/DD, and Timestamps all into strict YYYY-MM-DD
const normalizeToYYYYMMDD = (arr: any[]) => {
    return arr.map(item => {
        if (!item) return '';
        let rawDate = typeof item === 'object' ? (item.date || item.start || item.override_date || String(item)) : String(item);
        
        // Strip timestamps
        rawDate = rawDate.split('T')[0]; 

        // Handle Australian Slashes (DD/MM/YYYY)
        if (rawDate.includes('/')) {
            const p = rawDate.split('/');
            if (p.length === 3) {
                const y = p[2].length === 4 ? p[2] : p[0];
                const m = p[2].length === 4 ? p[1] : p[1];
                const d = p[2].length === 4 ? p[0] : p[2];
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }

        // Handle Dashes (YYYY-MM-DD or DD-MM-YYYY)
        if (rawDate.includes('-')) {
            const p = rawDate.split('-');
            if (p.length === 3) {
                const y = p[0].length === 4 ? p[0] : p[2];
                const m = p[1];
                const d = p[0].length === 4 ? p[2] : p[0];
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }

        return rawDate;
    }).filter(Boolean);
};

const IGNORED_TERM_PREFIXES = ['NSW -', 'QLD -', 'WA -', 'SA -', 'TAS -', 'NT -', 'ACT -'];
const IGNORED_HOLIDAY_TAGS = ['(NSW)', '(QLD)', '(WA)', '(SA)', '(TAS)', '(NT)', '(ACT)'];

const isHolidayByStr = (dateStr: string, holidays: any[] = []) => {
    if (!Array.isArray(holidays)) return false;
    const applicableHolidays = holidays.filter(h => !IGNORED_HOLIDAY_TAGS.some(tag => (h.name || '').includes(tag)));
    return applicableHolidays.some((h: any) => h.date === dateStr);
};

const isWithinTerm = (date: Date, terms: any[] = []) => { 
    if (!Array.isArray(terms)) return false;
    const checkTime = date.getTime(); 
    const applicableTerms = terms.filter(term => !IGNORED_TERM_PREFIXES.some(prefix => (term.name || '').startsWith(prefix)));
    return applicableTerms.some((term: any) => { 
        const s = term.start || term.startDate;
        const e = term.end || term.endDate;
        if (!s || !e) return false;
        return checkTime >= parseAsLocal(s).getTime() && checkTime <= parseAsLocal(e, '23:59').getTime(); 
    }); 
};

const isNonWorkingDay = (date: Date, holidays: any[] = []) => { 
    const dayOfWeek = date.getDay(); 
    if (isHolidayByStr(getLocalIsoString(date), holidays)) return true; 
    if (dayOfWeek === 0) return true; // Sunday default exclusion
    return false; 
};

export const generateAllEventsForInstance = (
    instance: CourseInstance, 
    academicYears: AcademicYear[], 
    template: Course | undefined, 
    subjects: Subject[],
    teachers: any[],
    scheduleOverrides: any[] = [] 
) => {
    const rawTemplate = template as any;
    const seqSubjects = rawTemplate?.sequenced_subjects || rawTemplate?.sequencedSubjects;

    if (!instance.start_date || !seqSubjects || seqSubjects.length === 0) return [];
    
    const events: any[] = [];
    const allowedDays = instance.allowed_days || [1, 2, 3, 4, 5];
    const hoursPerDay = instance.hours_per_day || 6;
    const [startHour, startMinute] = (instance.start_time || '09:00').split(':').map(Number);
    let currentDate = parseAsLocal(instance.start_date, instance.start_time || '09:00');
    
    const yearsMap: Record<string, AcademicYear> = {};
    if (Array.isArray(academicYears)) academicYears.forEach(y => yearsMap[String(y.id)] = y);

    const safeParse = (data: any) => Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data || '[]') : []);
    
    // Compile and Normalize all manual additions
    const manualAdds = normalizeToYYYYMMDD([
        ...safeParse(instance.additional_dates),
        ...scheduleOverrides.filter(o => o.action_type === 'add' && o.instance_id === instance.id).map(o => o.override_date)
    ]);

    // Compile and Normalize all manual exclusions
    const manualRemoves = normalizeToYYYYMMDD([
        ...safeParse(instance.excluded_dates),
        ...scheduleOverrides.filter(o => o.action_type === 'remove' && o.instance_id === instance.id).map(o => o.override_date)
    ]);

    for (const subjectItem of seqSubjects) {
        const subjectId = typeof subjectItem === 'string' ? subjectItem : subjectItem.subjectId || subjectItem.id;
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) continue;
        
        let hoursToSchedule = (subject.hours && subject.hours > 0) ? subject.hours : 40;

        while (hoursToSchedule > 0) {
            let sessionDate: Date | null = null;
            let searchDate = new Date(currentDate);

            for (let i = 0; i < MAX_DATE_SEARCH_ITERATIONS; i++) {
                const dayOfWeek = searchDate.getDay(); 
                const yearData = yearsMap[searchDate.getFullYear().toString()];
                const dateStr = getLocalIsoString(searchDate);

                if (manualRemoves.includes(dateStr)) {
                    searchDate.setDate(searchDate.getDate() + 1);
                    continue; 
                }

                if (
                    manualAdds.includes(dateStr) || 
                    (yearData && allowedDays.includes(dayOfWeek) && isWithinTerm(searchDate, yearData.terms || []) && !isNonWorkingDay(searchDate, yearData.holidays || []))
                ) {
                    sessionDate = new Date(searchDate);
                    break;
                }
                searchDate.setDate(searchDate.getDate() + 1);
            }

            if (!sessionDate) break;

            currentDate = new Date(sessionDate);
            currentDate.setDate(currentDate.getDate() + 1);

            const hoursThisSession = Math.min(hoursToSchedule, hoursPerDay);
            const start = new Date(sessionDate); start.setHours(startHour, startMinute, 0, 0);
            const end = new Date(start); end.setHours(start.getHours() + Math.floor(hoursThisSession), start.getMinutes() + ((hoursThisSession % 1) * 60), 0, 0);

            events.push({
                id: `${instance.id}-${subject.id}-${events.length}`, instanceId: instance.id, subjectId: subject.id,
                start, end, summary: subject.name, courseName: instance.name, hours: hoursThisSession
            });

            hoursToSchedule -= hoursThisSession;
        }
    }
    return events;
};
