import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { ApiService } from '../services/api';

export function useData<T>(tableName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await ApiService.getAll<T>(tableName);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime Subscription
    const subscription = supabase
      .channel(`public:${tableName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, fetchData)
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [tableName]);

  return { data, loading, error, refresh: fetchData };
}