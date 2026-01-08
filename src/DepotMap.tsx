// src/DepotMap.tsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

type Row = {
    bus_id: string;
    floor_id: string;
    x: number;
    y: number;
    source: string | null;
    buses?: { plate_number?: string; status?: string } | null;
};

export function DepotMap({
    currentLevel,
    isTransitioning,
    transitionMessage,
}: {
    currentLevel: number;
    isTransitioning?: boolean;
    transitionMessage?: string | null;
}) {
    const [markers, setMarkers] = useState<Row[]>([]);

    useEffect(() => {
        let timer: number;

        const loadMarkers = async () => {
            const { data, error } = await supabase
                .from('bus_positions')
                .select(`
          bus_id,
          floor_id,
          x,
          y,
          source,
          buses:bus_id (
            plate_number,
            status
          )
        `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error(error);
                return;
            }

            const seen = new Set<string>();
            const latest: Row[] = [];

            for (const row of (data || []) as Row[]) {
                if (!row.bus_id || seen.has(row.bus_id)) continue;
                if (row.buses?.status === 'outside') continue;
                seen.add(row.bus_id);
                latest.push(row);
            }

            setMarkers(latest);
        };

        loadMarkers();
        timer = window.setInterval(loadMarkers, 1500);

        return () => window.clearInterval(timer);
    }, []);

    const scale = 5;

    const backgrounds = [
        'radial-gradient(circle at top left, #e5f0ff, #f9fafb)', // Level 1
        'radial-gradient(circle at top left, #e0f2fe, #f9fafb)', // Level 2
        'radial-gradient(circle at top left, #e0f2f1, #f9fafb)', // Level 3
        'radial-gradient(circle at top left, #fef3c7, #f9fafb)', // Level 4
    ];

    const baseBg =
        backgrounds[Math.min(Math.max(currentLevel, 1), 4) - 1] ??
        'radial-gradient(circle at top left, #e5f0ff, #f9fafb)';

    const levelToFloorId: Record<number, string> = {
        1: 'f552ef4d-b28e-4248-92d2-b3473590bd10',
        2: '981c8b70-e931-4a6f-8685-2e579a102e8a',
        3: '3da25995-a132-42de-93d5-66535f5fa459',
        4: '84e50d22-8068-4844-bc13-c1ea72ac0c26',
    };
    // Show only markers whose floor_id matches the current level.
    // If your floor_id values are different, update this condition.
    console.log('markers raw in map:', markers);
    console.log('currentLevel:', currentLevel);
    console.log('expected floorId:', levelToFloorId[currentLevel]);

    const visibleMarkers = markers.filter(
        (m) => m.floor_id === levelToFloorId[currentLevel]
    );

    console.log('visibleMarkers', currentLevel, visibleMarkers);
    console.log('levelToFloorId', levelToFloorId);
    console.log('currentLevel', currentLevel, 'mapped floor', levelToFloorId[currentLevel]);


    return (
  <div className="map-wrapper">
    <div className="map-frame" style={{ background: baseBg }}>
      <div className="map-grid" />
      <div className="map-label">
        {transitionMessage
          ? transitionMessage
          : `Level ${currentLevel}${isTransitioning ? ' – moving…' : ''}`}
      </div>

      {visibleMarkers.map((m) => {
        const isParked =
          m.source != null && m.source.startsWith('parked_');
        const color = isParked ? '#ef4444' : '#22c55e';

        return (
          <div
            key={m.bus_id}
            className="bus-marker"
            style={{
              left: `${m.x * scale}px`,
              top: `${m.y * scale - 10}px`,
              width: 24,
              height: 24,
              backgroundColor: color,
            }}
            title={`${m.buses?.plate_number || m.bus_id} (${
              isParked ? 'parked' : 'moving'
            })`}
          >
            {m.buses?.plate_number?.slice(-2) ?? ''}
          </div>
        );
      })}
    </div>
  </div>
);
}
