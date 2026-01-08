// src/SlotAllocationDashboard.tsx

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

type BayRow = {
  id: string;
  bay_code: string;
  area_code: string;
  lot_number: number;
  is_charging_bay: boolean;
  is_available: boolean;
  current_bus_id: string | null;
  depot_floors: { level_number: number } | null;
  buses?: { plate_number?: string } | null;
  latest_allocation_status?: string | null;
  latest_override_status?: string | null;
  latest_bus_plate?: string | null; // NEW: plate from allocation
};

const LEVELS = [1, 2, 3, 4];

export function SlotAllocationDashboard({
  notifyDriverRefresh,
}: {
  notifyDriverRefresh: () => void;
}) {
  const [levelFilter, setLevelFilter] = useState<'all' | number>('all');
  const [bays, setBays] = useState<BayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [manualPlate, setManualPlate] = useState('');

  const loadBays = async () => {
    if (!firstLoadDone) {
      setLoading(true);
    }

    const { data, error } = await supabase
      .from('bays')
      .select(
        `
        id,
        bay_code,
        area_code,
        lot_number,
        is_charging_bay,
        is_available,
        current_bus_id,
        depot_floors:floor_id ( level_number ),
        buses:current_bus_id ( plate_number )
      `
      )
      .order('area_code', { ascending: true })
      .order('lot_number', { ascending: true });

    if (error || !data) {
      setStatus('Error loading bays: ' + (error?.message ?? 'unknown'));
      if (!firstLoadDone) setLoading(false);
      return;
    }

    const baseBays = data as unknown as BayRow[];
    const bayIds = baseBays.map((b) => b.id);

    const latestStatusByBay = new Map<string, string>();
    const latestOverrideStatusByBay = new Map<string, string>();
    const latestBusPlateByBay = new Map<string, string>(); // NEW

    if (bayIds.length > 0) {
      const { data: allocRows, error: allocError } = await supabase
        .from('allocations')
        .select(
          'bay_id, override_bay_id, status, bus_id, buses:bus_id ( plate_number ), created_at'
        )
        .in('bay_id', bayIds)
        .order('created_at', { ascending: false });

      if (!allocError && allocRows) {
        for (const row of allocRows as {
          bay_id: string | null;
          override_bay_id: string | null;
          status: string;
          buses?: { plate_number?: string | null } | null;
        }[]) {
          if (row.bay_id && !latestStatusByBay.has(row.bay_id)) {
            latestStatusByBay.set(row.bay_id, row.status);
            if (row.buses?.plate_number) {
              latestBusPlateByBay.set(row.bay_id, row.buses.plate_number);
            }
          }
          if (
            row.override_bay_id &&
            !latestOverrideStatusByBay.has(row.override_bay_id)
          ) {
            latestOverrideStatusByBay.set(row.override_bay_id, row.status);
          }
        }
      }
    }

    const merged: BayRow[] = baseBays.map((b) => ({
      ...b,
      latest_allocation_status: latestStatusByBay.get(b.id) ?? null,
      latest_override_status: latestOverrideStatusByBay.get(b.id) ?? null,
      latest_bus_plate: latestBusPlateByBay.get(b.id) ?? null, // NEW
    }));

    setBays(merged);
    if (!firstLoadDone) {
      setFirstLoadDone(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBays();
    const id = window.setInterval(loadBays, 5000);
    return () => window.clearInterval(id);
  }, []);

  const visibleBays =
    levelFilter === 'all'
      ? bays
      : bays.filter((b) => b.depot_floors?.level_number === levelFilter);

  const allocatePlateToBay = async (bayId: string, plate: string) => {
    const trimmed = plate.trim();
    if (!trimmed) {
      setStatus('Enter a plate number first.');
      return;
    }

    /*setStatus(`Allocating bay to ${trimmed} ...`);*/

    const { data: bus, error: busError } = await supabase
      .from('buses')
      .upsert({ plate_number: trimmed }, { onConflict: 'plate_number' })
      .select('id, needs_charging')
      .eq('plate_number', trimmed)
      .single();

    if (busError || !bus) {
      setStatus(
        'Error finding/creating bus: ' + (busError?.message ?? 'unknown')
      );
      return;
    }

    const { data: bay, error: bayError } = await supabase
      .from('bays')
      .select('id, bay_code, is_available')
      .eq('id', bayId)
      .maybeSingle();

    if (bayError || !bay) {
      setStatus('Selected bay not found.');
      return;
    }

    if (!bay.is_available) {
      setStatus('Bay is no longer available.');
      return;
    }

    const { error: allocError } = await supabase.from('allocations').insert({
      bus_id: bus.id,
      bay_id: bay.id,
      priority_reason: bus.needs_charging ? 'charging_manual' : 'manual',
      status: 'allocated',
    });

    if (allocError) {
      setStatus('Error creating allocation: ' + allocError.message);
      return;
    }

    const { error: bayUpdateError } = await supabase
      .from('bays')
      .update({ is_available: false, current_bus_id: bus.id })
      .eq('id', bay.id);

    if (bayUpdateError) {
      setStatus('Error updating bay: ' + bayUpdateError.message);
      return;
    }

    /*setStatus(`Allocated bay ${bay.bay_code} to ${trimmed}.`);*/
    setManualPlate('');
    loadBays();
    notifyDriverRefresh();
  };

  const handleAutoAllocateForPlate = async () => {
    if (!manualPlate.trim()) {
      setStatus('Enter a plate number first.');
      return;
    }

    /*setStatus('Allocating bay for ' + manualPlate + ' ...');*/

    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id, needs_charging')
      .eq('plate_number', manualPlate.trim())
      .maybeSingle();

    if (busError || !bus) {
      setStatus('Bus not found. Ensure it has entered the depot.');
      return;
    }

    let bayQuery = supabase
      .from('bays')
      .select('id, bay_code, is_charging_bay, is_available')
      .eq('is_available', true);

    if (bus.needs_charging) {
      bayQuery = bayQuery.eq('is_charging_bay', true);
    }

    const { data: freeBays, error: bayError } = await bayQuery
      .order('area_code', { ascending: true })
      .order('lot_number', { ascending: true });

    if (bayError || !freeBays || freeBays.length === 0) {
      setStatus('No free bays available for this bus.');
      return;
    }

    const chosen = freeBays[0];

    const { error: allocError } = await supabase.from('allocations').insert({
      bus_id: bus.id,
      bay_id: chosen.id,
      priority_reason: bus.needs_charging ? 'charging' : 'default',
      status: 'allocated',
    });

    if (allocError) {
      setStatus('Error creating allocation: ' + allocError.message);
      return;
    }

    const { error: bayUpdateError } = await supabase
      .from('bays')
      .update({ is_available: false, current_bus_id: bus.id })
      .eq('id', chosen.id);

    if (bayUpdateError) {
      setStatus('Error updating bay: ' + bayUpdateError.message);
      return;
    }

    /*setStatus(`Allocated bay ${chosen.bay_code} to ${manualPlate}.`);*/
    setManualPlate('');
    loadBays();
    notifyDriverRefresh();
  };

  // ---------- Render ----------
  return (
    <div className="slot-dashboard">
      <div className="slot-dashboard-header">
        <div className="slot-filters">
          <span>Level:</span>
          <button
            className={
              levelFilter === 'all' ? 'level-filter active' : 'level-filter'
            }
            onClick={() => setLevelFilter('all')}
          >
            All
          </button>
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              className={
                levelFilter === lvl ? 'level-filter active' : 'level-filter'
              }
              onClick={() => setLevelFilter(lvl)}
            >
              L{lvl}
            </button>
          ))}
        </div>

        <div className="slot-actions">
          <input
            type="text"
            placeholder="Plate (e.g. SBS001A)"
            value={manualPlate}
            onChange={(e) => setManualPlate(e.target.value)}
          />
          <button onClick={handleAutoAllocateForPlate}>Auto-allocate bay</button>
        </div>
      </div>

      {status && <div className="slot-status">{status}</div>}

      {loading && !firstLoadDone && <div>Loading bays…</div>}

      <div className="slot-grid-wrapper">
        <div className="slot-grid">
          {visibleBays.map((bay) => {
            const level = bay.depot_floors?.level_number ?? '?';
            const allocStatus = bay.latest_allocation_status;
            const overrideStatus = bay.latest_override_status;

            let bayState:
              | 'available'
              | 'pending'
              | 'occupied'
              | 'busy'
              | 'override_actual'
              | 'override_allocated' = 'available';

            if (overrideStatus === 'override_parked') {
              if (!bay.is_available && bay.current_bus_id) {
                bayState = 'override_actual';
              } else {
                bayState = 'override_allocated';
              }

            } else if (allocStatus === 'allocated') {
              // Allocated bay must always show Pending parking,
              // even if a bus happens to be standing there.
              bayState = 'pending';

            } else if (allocStatus === 'parked') {
              bayState = 'occupied';

            } else {
              // No active allocation for this bay; if a bus is here it is "busy"
              if (!bay.is_available && bay.current_bus_id) {
                bayState = 'busy';
              } else {
                bayState = 'available';
              }
            }

            const colorClass =
              bayState === 'available'
                ? 'bay-free'
                : bayState === 'pending'
                  ? 'bay-charging'
                  : bayState === 'override_allocated'
                    ? 'bay-override'
                    : 'bay-occupied';

            let buttonLabel = 'Assign to bay';
            let buttonDisabled = false;

            if (bayState === 'pending') {
              buttonLabel = 'Pending parking';
              buttonDisabled = true;
            } else if (bayState === 'occupied') {
              buttonLabel = 'Occupied';
              buttonDisabled = true;
            } else if (bayState === 'busy') {
              buttonLabel = 'Busy';
              buttonDisabled = true;
            } else if (bayState === 'override_actual') {
              buttonLabel = 'Occupied (override)';
              buttonDisabled = true;
            } else if (bayState === 'override_allocated') {
              buttonLabel = 'Overridden allocation';
              buttonDisabled = true;
            }

            const allocatedLabel =
              bayState === 'pending' && bay.latest_bus_plate
                ? `Allocated: ${bay.latest_bus_plate}`
                : bayState === 'pending'
                  ? 'Allocated'
                  : bayState === 'override_allocated'
                    ? 'Overridden'
                    : bayState === 'override_actual'
                      ? 'Override parked'
                      : bayState === 'busy'
                        ? 'Busy'
                        : bayState === 'occupied'
                          ? 'Parked'
                          : 'Available';

            return (
              <div key={bay.id} className={`bay-card ${colorClass}`}>
                <div className="bay-main">
                  <div className="bay-code">{bay.bay_code}</div>
                  <div className="bay-meta">
                    L{level} · Area {bay.area_code} · Lot {bay.lot_number}
                  </div>
                </div>
                <div className="bay-tags">
                  {bay.buses?.plate_number && (
                    <span className="tag">{bay.buses.plate_number}</span>
                  )}
                  {bay.is_charging_bay && <span className="tag">EV</span>}
                  <span className="tag">{allocatedLabel}</span>
                </div>
                <button
                  className="bay-clear"
                  disabled={buttonDisabled}
                  onClick={
                    bayState === 'available'
                      ? () => allocatePlateToBay(bay.id, manualPlate)
                      : undefined
                  }
                >
                  {buttonLabel}
                </button>
              </div>
            );
          })}
        </div>

        {!loading && visibleBays.length === 0 && (
          <div>No bays found for this filter.</div>
        )}
      </div>
    </div>
  );
}
