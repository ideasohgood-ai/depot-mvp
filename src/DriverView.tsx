// src/DriverView.tsx

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

type DriverInfo = {
  plate_number: string;
  level_number: number;
  area_code: string;
  lot_number: number;
  bay_code: string;
  status: string; // allocation status
  bay_id: string;
  bay_floor_id: string;
  bay_x: number;
  bay_y: number;
  bus_id: string;
  allocation_id: string;
};

type AllocationRow = {
  id: string;
  bus_id: string;
  status: string;
  wrong_attempts: number | null;
  bays?: {
    id: string;
    bay_code: string;
    area_code: string;
    lot_number: number;
    floor_id: string;
    x: number;
    y: number;
    depot_floors?: { level_number: number | null } | null;
  } | null;
};

type BusStatus = 'outside' | 'entering' | 'inside' | 'leaving' | null;

export function DriverView({ refreshToken }: { refreshToken: number }) {
  const [plate, setPlate] = useState('SBS001A');
  const [info, setInfo] = useState<DriverInfo | null>(null);
  const [busStatus, setBusStatus] = useState<BusStatus>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsCharging, setNeedsCharging] = useState(false);
  const [needsMaintenance, setNeedsMaintenance] = useState(false);

  // ---------- Update preferences ----------
  const handleUpdatePreferences = async () => {
    setLoading(true);
    setMessage(null);

    const { data: busRow, error: busError } = await supabase
      .from('buses')
      .upsert({ plate_number: plate }, { onConflict: 'plate_number' })
      .select('id, plate_number')
      .single();

    if (busError || !busRow) {
      setMessage('Error updating bus preferences.');
      setLoading(false);
      return;
    }

    await supabase
      .from('buses')
      .update({
        needs_charging: needsCharging,
        needs_maintenance: needsMaintenance,
      })
      .eq('id', busRow.id);

    setMessage(`Preferences updated for ${busRow.plate_number}.`);
    setLoading(false);
  };

  // ---------- Load current parking instruction ----------
  const loadInstruction = async () => {
    setLoading(true);
    setMessage(null);
    setInfo(null);
    setBusStatus(null);

    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id, plate_number, status')
      .eq('plate_number', plate)
      .maybeSingle();

    if (busError || !bus) {
      setLoading(false);
      return;
    }

    const statusValue = (bus.status as BusStatus) ?? 'outside';
    setBusStatus(statusValue);

    if (statusValue !== 'inside') {
      setLoading(false);
      return;
    }

    const { data: allocation, error: allocError } = await supabase
      .from('allocations')
      .select(
        `
        id,
        bus_id,
        status,
        wrong_attempts,
        bays:bay_id (
          id,
          bay_code,
          area_code,
          lot_number,
          floor_id,
          x,
          y,
          depot_floors:floor_id ( level_number )
        )
      `
      )
      .eq('bus_id', bus.id)
      .in('status', ['allocated', 'parked', 'override_parked'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (allocError || !allocation) {
      setInfo(null);
      setLoading(false);
      return;
    }

    const alloc = allocation as unknown as AllocationRow;
    const bay = alloc.bays;
    const floor = bay?.depot_floors;

    if (!bay || !floor) {
      setInfo(null);
      setLoading(false);
      return;
    }

    setInfo({
      plate_number: bus.plate_number,
      level_number: floor.level_number ?? 0,
      area_code: bay.area_code,
      lot_number: bay.lot_number,
      bay_code: bay.bay_code,
      status: alloc.status,
      bay_id: bay.id,
      bay_floor_id: bay.floor_id,
      bay_x: bay.x,
      bay_y: bay.y,
      bus_id: alloc.bus_id,
      allocation_id: alloc.id,
    });

    setLoading(false);
  };

  useEffect(() => {
    loadInstruction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, refreshToken]);

  // ---------- Confirm parked with verification / override ----------
  const handleConfirmParked = async () => {
    setMessage(null);
    if (!info) return;

    const { data: allocRow, error: allocFetchError } = await supabase
      .from('allocations')
      .select('id, status, wrong_attempts')
      .eq('id', info.allocation_id)
      .maybeSingle();

    if (allocFetchError || !allocRow) {
      setMessage('Unable to verify current allocation.');
      return;
    }

    if (allocRow.status === 'override_parked') {
      setMessage(
        'Parking override already recorded. Please follow controller instructions.'
      );
      return;
    }

    const { data: pos, error: posError } = await supabase
      .from('bus_positions')
      .select('floor_id, x, y')
      .eq('bus_id', info.bus_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (posError || !pos) {
      setMessage(
        'Cannot confirm parking – no recent position for this bus. Please try again after moving on the map.'
      );
      return;
    }

    const sameFloor = pos.floor_id === info.bay_floor_id;
    const dx = Math.abs(pos.x - info.bay_x);
    const dy = Math.abs(pos.y - info.bay_y);
    const withinTolerance = dx <= 5 && dy <= 5;

    if (!sameFloor || !withinTolerance) {
      const attempts = (allocRow.wrong_attempts ?? 0) + 1;

      await supabase
        .from('allocations')
        .update({ wrong_attempts: attempts })
        .eq('id', info.allocation_id);

      if (attempts >= 3) {
        const { data: allBays, error: baysError } = await supabase
          .from('bays')
          .select('id, x, y');

        let overrideBayId: string | null = null;

        if (!baysError && allBays) {
          let bestDist = Infinity;
          for (const b of allBays as {
            id: string;
            x: number;
            y: number;
          }[]) {
            const dx = b.x - pos.x;
            const dy = b.y - pos.y;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              overrideBayId = b.id;
            }
          }
        }

        await supabase
          .from('allocations')
          .update({ status: 'override_parked', override_bay_id: overrideBayId })
          .eq('id', info.allocation_id);

        if (overrideBayId) {
          await supabase
            .from('bays')
            .update({ is_available: true, current_bus_id: null })
            .eq('current_bus_id', info.bus_id);

          await supabase
            .from('bays')
            .update({ is_available: false, current_bus_id: info.bus_id })
            .eq('id', overrideBayId);
        }

        setMessage(
          'You have parked at a different bay three times. Override recorded – controller will be notified.'
        );
      } else {
        setMessage(
          'You are not at the allocated bay. Please move to the correct lot before confirming.'
        );
      }

      if (attempts >= 3) {
        await loadInstruction();
      }
      return;
    }

    const { error: allocError } = await supabase
      .from('allocations')
      .update({ status: 'parked' })
      .eq('bus_id', info.bus_id)
      .eq('status', 'allocated')
      .order('created_at', { ascending: false })
      .limit(1);

    if (allocError) {
      setMessage('Error confirming parking: ' + allocError.message);
      return;
    }

    const { error: bayUpdateError } = await supabase
      .from('bays')
      .update({ is_available: false, current_bus_id: info.bus_id })
      .eq('id', info.bay_id);

    if (bayUpdateError) {
      setMessage(
        'Parking saved, but failed to update bay state: ' + bayUpdateError.message
      );
    } else {
      setMessage('Thank you. Parking confirmed.');
    }

    await loadInstruction();
  };

  // Show confirm button only while allocation is still pending
  const canConfirmParking =
    busStatus === 'inside' && info && info.status === 'allocated';

  // ---------- Render ----------
  return (
    <div className="panel" style={{ marginTop: 24 }}>
      {/* Controls container */}
      <div
        className="panel-section"
        style={{
          paddingBottom: 16,
          borderBottom: '1px solid #e5e7eb',
          marginBottom: 12,
        }}
      >
        <div className="field-row" style={{ marginTop: 8 }}>
          <span className="field-label">Bus plate</span>
          <input
            className="text-input"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
          />
        </div>

        <div className="field-row" style={{ marginTop: 6 }}>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={needsCharging}
              onChange={(e) => setNeedsCharging(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Needs charging
          </label>
          <label style={{ fontSize: 13, marginLeft: 12 }}>
            <input
              type="checkbox"
              checked={needsMaintenance}
              onChange={(e) => setNeedsMaintenance(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Needs maintenance
          </label>
        </div>

        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleUpdatePreferences}
            disabled={loading}
          >
            {loading ? 'Updating…' : 'Update preferences'}
          </button>

          {canConfirmParking && (
            <button className="btn" onClick={handleConfirmParked}>
              I have parked
            </button>
          )}
        </div>

        {message && <p className="status-text">{message}</p>}
      </div>

      {/* Instructions container */}
      <div className="panel-section">
        <div className="panel-header" style={{ marginBottom: 6 }}>
          <h3 className="panel-title" style={{ fontSize: 14 }}>
            Driver instructions
          </h3>
        </div>

        <div>
          {busStatus === 'entering' && (
            <p className="status-text">
              Vehicle verification in progress. Checking lot requirements…
            </p>
          )}

          {busStatus === 'inside' && !info && (
            <p className="status-text">
              Pending lot allocation. Please wait for your assigned bay.
            </p>
          )}

          {busStatus === 'inside' && info && (
            <>
              <p style={{ fontSize: 14, margin: 0 }}>
                Please proceed to{' '}
                <strong>
                  Level {info.level_number}, Area {info.area_code}, Lot{' '}
                  {info.lot_number}
                </strong>
                .
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  marginTop: 4,
                }}
              >
                Bay: {info.bay_code} · Allocation status: {info.status}
              </p>
            </>
          )}

          {busStatus === 'outside' && (
            <p className="status-text">
              Vehicle is outside the depot. Enter the depot to receive a bay.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
