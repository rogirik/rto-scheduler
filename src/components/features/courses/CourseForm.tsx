import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase'; // <-- INJECTED SUPABASE FOR AUTH CHECK
import type { Course, Subject } from '../../../services/api';
import { Search, Plus, X, Clock, GripVertical, Save, Loader2, Globe } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface CourseFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Course | null;
}

export const CourseForm = ({ onClose, onSuccess, initialData }: CourseFormProps) => {
  const [loading, setLoading] = useState(false);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
  });

  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Get the current user
        const { data: { user } } = await supabase.auth.getUser();
        
        // 2. Fetch all raw subjects
        const subjects = await ApiService.getAll<Subject>('subjects');
        let validSubjects = subjects || [];

        // 3. THE MARK YATES TACKLE: Strict Organization Filtering
        if (user) {
            let myOrgId = null;
            
            // Check user_profiles for org ID
            try {
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('organization_id')
                    .eq('id', user.id)
                    .single();
                if (profile) myOrgId = profile.organization_id;
            } catch(e) {}

            // Fallback to teachers table
            if (!myOrgId) {
                const { data: teachers } = await supabase
                    .from('teachers')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .limit(1);
                if (teachers && teachers.length > 0) myOrgId = teachers[0].organization_id;
            }

            // Execute the block: Only allow exact matches
            validSubjects = validSubjects.filter((s: any) => {
                if (myOrgId && s.organization_id) return s.organization_id === myOrgId;
                return s.user_id === user.id;
            });
        }

        setAllSubjects(validSubjects);

        if (initialData) {
          setFormData({
            code: initialData.code || '', 
            name: initialData.name,
            description: (initialData as any).description || '', 
          });

          if (initialData.sequenced_subjects && Array.isArray(initialData.sequenced_subjects)) {
             const linked = initialData.sequenced_subjects
               .map((savedItem: any) => {
                   const id = typeof savedItem === 'string' ? savedItem : savedItem.id;
                   const baseSub = validSubjects.find(s => s.id === id); // Use filtered list
                   if (!baseSub) return null;
                   
                   // HYDRATION: Merge global subject info with the LOCAL online flag
                   return {
                       ...baseSub,
                       is_online: typeof savedItem === 'object' ? !!savedItem.is_online : false
                   };
               })
               .filter(Boolean) as Subject[];
             setSelectedSubjects(linked);
          }
        }
      } catch (e) {
        console.error("Failed to load subjects", e);
      }
    };
    loadData();
  }, [initialData]);

  const addSubject = (subject: Subject) => {
    if (!selectedSubjects.find(s => s.id === subject.id)) {
      setSelectedSubjects([...selectedSubjects, subject]);
    }
  };

  const removeSubject = (subjectId: string) => {
    setSelectedSubjects(selectedSubjects.filter(s => s.id !== subjectId));
  };

  // Toggle online status ONLY for this specific qualification
  const toggleOnline = (subjectId: string, isOnline: boolean) => {
    setSelectedSubjects(prev => prev.map(s => 
      s.id === subjectId ? { ...s, is_online: isOnline } as Subject : s
    ));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(selectedSubjects);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSelectedSubjects(items);
  };

  const totalHours = selectedSubjects.reduce((sum, s) => sum + (s.hours || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // SAVE LOGIC: Save the local configuration (including is_online) to the template
      const payload = {
        ...formData,
        sequenced_subjects: selectedSubjects.map(sub => ({
            id: sub.id,
            code: sub.code,
            name: sub.name,
            hours: sub.hours,
            is_online: (sub as any).is_online || false
        }))
      };

      if (initialData?.id) {
        await ApiService.updateCourse(initialData.id, payload);
      } else {
        await ApiService.createCourse(payload);
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      alert('Failed to save course. Please check the console.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubjects = allSubjects.filter(s => 
    !selectedSubjects.find(sel => sel.id === s.id) && 
    (s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
                <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Qualification' : 'Create Qualification'}</h2>
                <p className="text-xs text-slate-500">Online toggles here only apply to this specific qualification.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Code</label>
                <input required placeholder="e.g. TAE40122" className="w-full border border-slate-300 p-2 rounded-lg font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qualification Name</label>
                <input required placeholder="e.g. Certificate IV in Training and Assessment" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="col-span-4">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea rows={2} className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>

            <div className="border-t border-slate-100"></div>

            <div className="grid grid-cols-2 gap-6 h-[500px]">
              
              <div className="flex flex-col h-full border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="p-3 bg-white border-b border-slate-200">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded-lg text-sm transition-all outline-none" placeholder="Search available units..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {filteredSubjects.map(subject => (
                    <button key={subject.id} type="button" onClick={() => addSubject(subject)} className="w-full text-left p-3 bg-white hover:bg-blue-50 hover:border-blue-200 border border-slate-200 rounded-lg shadow-sm transition-all group flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-700 text-sm">{subject.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock size={10} /> {subject.hours} hrs</div>
                      </div>
                      <Plus size={16} className="text-slate-300 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col h-full border-2 border-blue-100 rounded-xl overflow-hidden bg-white shadow-inner">
                <div className="p-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                  <span className="font-bold text-blue-900 text-sm">Course Structure</span>
                  <span className="text-xs bg-white text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">{selectedSubjects.length} Units</span>
                </div>
                
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="course-subjects">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                        {selectedSubjects.map((subject, index) => (
                            <Draggable key={subject.id} draggableId={subject.id} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} className={`flex items-center gap-3 p-3 bg-white border rounded-lg group transition-shadow ${snapshot.isDragging ? 'shadow-lg border-blue-400 ring-1 ring-blue-400 z-50' : 'border-slate-100 shadow-sm'}`} style={provided.draggableProps.style}>
                                  <div {...provided.dragHandleProps} className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-1"><GripVertical size={16} /></div>
                                  <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">{index + 1}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-800 text-sm truncate">{subject.name}</div>
                                    <div className="flex items-center gap-4 mt-1">
                                        <div className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12}/> {subject.hours} hrs</div>
                                        <label className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 px-1.5 py-0.5 rounded transition-colors border border-transparent hover:border-slate-200">
                                            <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer" checked={(subject as any).is_online || false} onChange={(e) => toggleOnline(subject.id, e.target.checked)} />
                                            <Globe size={12} className={(subject as any).is_online ? "text-blue-600" : "text-slate-400"} />
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${(subject as any).is_online ? "text-blue-700" : "text-slate-400"}`}>Online Allowed</span>
                                        </label>
                                    </div>
                                  </div>
                                  <button type="button" onClick={() => removeSubject(subject.id)} className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"><X size={16} /></button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total Nominal Duration</span>
                  <span className="text-sm font-bold text-slate-800">{totalHours} Hours</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Cancel</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {loading ? 'Saving...' : initialData ? 'Update Qualification' : 'Create Qualification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
