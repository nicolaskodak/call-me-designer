import { useEffect, useState } from 'react';
import { createGeometryClient, type GeometryClient } from '../geometry/client';

export function useGeometryClient(): GeometryClient | null {
  const [client, setClient] = useState<GeometryClient | null>(null);
  useEffect(() => {
    const created = createGeometryClient();
    setClient(created);
    return () => created.terminate();
  }, []);
  return client;
}
