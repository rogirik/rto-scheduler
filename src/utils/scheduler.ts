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

const extractDates = (data: any) => {
    if (!data) return [];
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const regex = /(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{4})/g;
    const matches = str.match(regex) || [];
    
    return matches.map(d => {
        const p = d.replace(/\//g, '-').split('-');
        const y = p[0].length === 4 ? p[0] : p[2];
        const m = p[1];
        const day = p[0].length === 4 ? p[2] : p[0];
        return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
    });
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
    if (dayOfWeek === 0) return true; 
    return false; 
};

export const generateAllEventsForInstance = (
    instance: CourseInstance & { scheduling_mode?: string, subject_rules?: Record<string, any> }, 
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
    
    // Global Fallbacks
    const globalAllowedDays = instance.allowed_days || [1, 2, 3, 4, 5];
    const globalStartDate = instance.start_date;
    const isFlexible = instance.scheduling_mode === 'flexible';
    const subjectRules = instance.subject_rules || {};

    const hoursPerDay = instance.hours_per_day || 6;
    const [startHour, startMinute] = (instance.start_time || '09:00').split(':').map(Number);
    
    // We only use this global tracker if we are in Consecutive mode
    let consecutiveCurrentDate = parseAsLocal(globalStartDate, instance.start_time || '09:00');
    
    const yearsMap: Record<string, AcademicYear> = {};
    if (Array.isArray(academicYears)) academicYears.forEach(y => yearsMap[String(y.id)] = y);

    const manualAdds = [
        ...extractDates(instance.additional_dates),
        ...extractDates(scheduleOverrides.filter(o => o.action_type === 'add' && o.instance_id === instance.id).map(o => o.override_date))
    ];

    const manualRemoves = [
        ...extractDates(instance.excluded_dates),
        ...extractDates(scheduleOverrides.filter(o => o.action_type === 'remove' && o.instance_id === instance.id).map(o => o.override_date))
    ];

    for (const subjectItem of seqSubjects) {
        const subjectId = typeof subjectItem === 'string' ? subjectItem : subjectItem.subjectId || subjectItem.id;
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) continue;
        
        let hoursToSchedule = (subject.hours && subject.hours > 0) ? subject.hours : 40;

        // --- THE FLEXIBLE SWITCH ---
        // Determine the start date and allowed days for this SPECIFIC subject
        const rule = subjectRules[subject.id];
        const subjectAllowedDays = (isFlexible && rule?.allowed_days?.length > 0) ? rule.allowed_days : globalAllowedDays;
        
        // If Flexible, start counting from the subject's specific start date. If Consecutive, pick up where the last subject left off.
        let subjectSearchDate = isFlexible 
            ? parseAsLocal(rule?.start_date || globalStartDate, instance.start_time || '09:00')
            : new Date(consecutiveCurrentDate);

        while (hoursToSchedule > 0) {
            let sessionDate: Date | null = null;
            let searchDate = new Date(subjectSearchDate);

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
                    (yearData && subjectAllowedDays.includes(dayOfWeek) && isWithinTerm(searchDate, yearData.terms || []) && !isNonWorkingDay(searchDate, yearData.holidays || []))
                ) {
                    sessionDate = new Date(searchDate);
                    break;
                }
                searchDate.setDate(searchDate.getDate() + 1);
            }

            if (!sessionDate) break;

            // Move the subject tracker forward by 1 day
            subjectSearchDate = new Date(sessionDate);
            subjectSearchDate.setDate(subjectSearchDate.getDate() + 1);

            // If we are in consecutive mode, update the global tracker so the next subject starts after this one finishes
            if (!isFlexible) {
                consecutiveCurrentDate = new Date(subjectSearchDate);
            }

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