// src/SimulationPanel.tsx
import { useState } from 'react';
import { supabase } from './supabaseClient';

type GateType = 'entry' | 'exit';
type LevelDirection = 'up' | 'down';

type BayForMove = {
  id: string;
  floor_id: string;
  x: number;
  y: number;
  bay_code: string;
};

type AllocationWithBay = {
  id: string;
  status: string;
  bay_id: string;
  bays: {
    id: string;
    floor_id: string;
    x: number;
    y: number;
    bay_code: string;
  } | null;
};


export function SimulationPanel({
  setCurrentLevel,
  setTransitionMessage,
  notifyDriverRefresh,
  notifyAlertRefresh,
  onStatusChange,
}: {
  setCurrentLevel: (level: number) => void;
  setTransitionMessage: (msg: string | null) => void;
  notifyDriverRefresh: () => void;
  notifyAlertRefresh: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [plate, setPlate] = useState('SBS001A');
  const [status, setStatus] = useState<string | null>(null);
  const [pendingBusId, setPendingBusId] = useState<string | null>(null);
  const [anprTimerId, setAnprTimerId] = useState<number | null>(null);
  const [anprUsed, setAnprUsed] = useState<boolean | null>(null); // true = ANPR, false = RFID
  const [currentGate, setCurrentGate] = useState<GateType | null>(null);
  const [currentLevel, _setCurrentLevel] = useState<number>(1); // 1–4

  const updateLevel = (level: number) => {
    _setCurrentLevel(level);
    setCurrentLevel(level);
  };

  const updateStatus = (message: string | null) => {
    setStatus(message);
    onStatusChange(message ?? '');
  };

  /* ---------- Helper: close allocations + free bays on exit ---------- */

  const closeAllocationsAndFreeBay = async (busId: string) => {
    await supabase
      .from('allocations')
      .update({ status: 'completed_departed' })
      .eq('bus_id', busId)
      .in('status', ['allocated', 'parked', 'exception_wrong_bay', 'override_parked']);

    await supabase
      .from('bays')
      .update({ is_available: true, current_bus_id: null })
      .eq('current_bus_id', busId);
  };

  /* ---------- Gate handling (entry/exit) ---------- */

  const handleGateEvent = async (gate: GateType) => {
    updateStatus(
      gate === 'entry'
        ? 'Bus entering depot… awaiting ANPR or RFID.'
        : 'Bus leaving depot… awaiting ANPR or RFID.'
    );
    setAnprUsed(null);

    const { data: bus, error: busError } = await supabase
      .from('buses')
      .upsert({ plate_number: plate }, { onConflict: 'plate_number' })
      .select('id, status')
      .single();

    if (busError || !bus) {
      updateStatus('Error finding bus: ' + (busError?.message ?? 'unknown'));
      return;
    }

    const busId = bus.id as string;
    setPendingBusId(busId);

    await supabase
      .from('buses')
      .update({ status: gate === 'entry' ? 'entering' : 'leaving' })
      .eq('id', busId);

    if (gate === 'exit') {
      await closeAllocationsAndFreeBay(busId);
    }

    if (anprTimerId) {
      window.clearTimeout(anprTimerId);
    }

    const id = window.setTimeout(() => {
      if (pendingBusId && anprUsed === null) {
        handleRfidFallback(busId, gate);
      }
    }, 5000);

    setAnprTimerId(id);
    setCurrentGate(gate);
    notifyDriverRefresh();
    notifyAlertRefresh();
  };

  const handleEnterDepot = () => handleGateEvent('entry');
  const handleLeaveDepot = () => handleGateEvent('exit');

  /* ---------- ANPR / RFID ---------- */

  const handleAnprIdentify = async () => {
    if (!pendingBusId || !currentGate) {
      updateStatus('No bus waiting at gate. Click Enter/Leave depot first.');
      return;
    }

    if (anprTimerId) {
      window.clearTimeout(anprTimerId);
      setAnprTimerId(null);
    }

    setAnprUsed(true);
    updateStatus(
      currentGate === 'entry'
        ? 'ANPR entry identification successful. Bus visible on map.'
        : 'ANPR exit identification successful. Bus leaving depot.'
    );

    const checkpointName = currentGate === 'entry' ? 'Entrance' : 'Exit';

    const { data: cp, error: cpError } = await supabase
      .from('checkpoints')
      .select('floor_id, x, y')
      .eq('name', checkpointName)
      .maybeSingle();

    if (cpError || !cp) {
      updateStatus('Error fetching checkpoint: ' + (cpError?.message ?? 'unknown'));
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: pendingBusId,
      floor_id: cp.floor_id,
      x: cp.x,
      y: cp.y,
      source: currentGate === 'entry' ? 'anpr_entry' : 'anpr_exit',
    });

    if (posError) {
      updateStatus('Error inserting bus position: ' + posError.message);
      return;
    }

    await supabase
      .from('buses')
      .update({ status: currentGate === 'entry' ? 'inside' : 'outside' })
      .eq('id', pendingBusId);

    if (currentGate === 'exit') {
      setPendingBusId(null);
      setCurrentGate(null);
      updateLevel(1);
    }

    notifyDriverRefresh();
    notifyAlertRefresh();
  };

  const handleRfidFallback = async (busIdFromTimer?: string, gateOverride?: GateType) => {
    const busId = busIdFromTimer ?? pendingBusId;
    const gate = gateOverride ?? currentGate;
    if (!busId || !gate) return;

    setAnprUsed(false);
    updateStatus(
      gate === 'entry'
        ? 'ANPR timeout – using RFID to identify entering bus.'
        : 'ANPR timeout – using RFID to identify leaving bus.'
    );

    const checkpointName = gate === 'entry' ? 'Entrance' : 'Exit';

    const { data: cp, error: cpError } = await supabase
      .from('checkpoints')
      .select('floor_id, x, y')
      .eq('name', checkpointName)
      .maybeSingle();

    if (cpError || !cp) {
      updateStatus('Error fetching checkpoint: ' + (cpError?.message ?? 'unknown'));
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: busId,
      floor_id: cp.floor_id,
      x: cp.x,
      y: cp.y,
      source: gate === 'entry' ? 'rfid_entry' : 'rfid_exit',
    });

    if (posError) {
      updateStatus('Error inserting bus position: ' + posError.message);
      return;
    }

    await supabase
      .from('buses')
      .update({ status: gate === 'entry' ? 'inside' : 'outside' })
      .eq('id', busId);

    if (gate === 'exit') {
      await closeAllocationsAndFreeBay(busId);
      setPendingBusId(null);
      setCurrentGate(null);
      updateLevel(1);
    }

    notifyDriverRefresh();
    notifyAlertRefresh();
  };

  /* ---------- Move to CP1–CP4 ---------- */

  const moveToCheckpoint = async (cpName: string) => {
    if (!pendingBusId) {
      updateStatus('No active bus to move. Enter the depot first.');
      return;
    }

    updateStatus('Moving bus to ' + cpName + '...');

    const { data: floor, error: floorError } = await supabase
      .from('depot_floors')
      .select('id, level_number')
      .eq('level_number', currentLevel)
      .maybeSingle();

    if (floorError || !floor) {
      updateStatus('Level ' + currentLevel + ' not configured in depot_floors.');
      return;
    }

    const { data: cp, error: cpError } = await supabase
      .from('checkpoints')
      .select('floor_id, name, x, y')
      .eq('floor_id', floor.id)
      .eq('name', cpName)
      .maybeSingle();

    if (cpError || !cp) {
      updateStatus('Checkpoint not found: ' + cpName + ' on Level ' + currentLevel);
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: pendingBusId,
      floor_id: cp.floor_id,
      x: cp.x,
      y: cp.y,
      source: 'checkpoint_' + cpName.toLowerCase(),
    });

    if (posError) {
      updateStatus('Error inserting position for ' + cpName + ': ' + posError.message);
      return;
    }

    updateStatus('Bus moved to ' + cpName + '.');
  };

  /* ---------- Level change (up/down) ---------- */

  const handleLevelChange = async (direction: LevelDirection) => {
    if (!pendingBusId) {
      updateStatus('No active bus to move between levels.');
      return;
    }

    const delta = direction === 'up' ? 1 : -1;
    const targetLevel = currentLevel + delta;

    if (targetLevel < 1 || targetLevel > 4) {
      updateStatus(
        direction === 'up'
          ? 'Already at highest level (4).'
          : 'Already at lowest level (1).'
      );
      return;
    }

    const { data: currentFloor, error: currentFloorError } = await supabase
      .from('depot_floors')
      .select('id, level_number')
      .eq('level_number', currentLevel)
      .maybeSingle();

    if (currentFloorError || !currentFloor) {
      updateStatus('Current level ' + currentLevel + ' not configured.');
      return;
    }

    const checkpointName =
      direction === 'up'
        ? `Level ${currentLevel} to Level ${targetLevel} up`
        : `Level ${currentLevel} to Level ${targetLevel} down`;

    const { data: cp, error: cpError } = await supabase
      .from('checkpoints')
      .select('floor_id, x, y, name')
      .eq('floor_id', currentFloor.id)
      .eq('name', checkpointName)
      .maybeSingle();

    if (cpError || !cp) {
      updateStatus('Checkpoint not found: ' + checkpointName);
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: pendingBusId,
      floor_id: cp.floor_id,
      x: cp.x,
      y: cp.y,
      source: direction === 'up' ? 'level_up' : 'level_down',
    });

    if (posError) {
      updateStatus('Error inserting level-change position: ' + posError.message);
      return;
    }

    updateLevel(targetLevel);
    const msg = `Bus proceeding to Level ${targetLevel}.`;
    updateStatus(msg);
    setTransitionMessage(msg);

    window.setTimeout(() => {
      setTransitionMessage(null);
    }, 2000);
  };

  /* ---------- Move to allocated bay / random open slot ---------- */

  const handleMoveToAllocation = async () => {
    if (!pendingBusId) {
      updateStatus('No active bus. Enter the depot and identify first.');
      return;
    }

    updateStatus('Moving bus to allocated bay...');

    const { data: floor, error: floorError } = await supabase
      .from('depot_floors')
      .select('id, level_number')
      .eq('level_number', currentLevel)
      .maybeSingle();

    if (floorError || !floor) {
      updateStatus('Current level not configured in depot_floors.');
      return;
    }

    const { data: allocRaw, error: allocError } = await supabase
      .from('allocations')
      .select(
        `
        id,
        status,
        bay_id,
        bays:bay_id (
          id,
          floor_id,
          x,
          y,
          bay_code
        )
      `
      )
      .eq('bus_id', pendingBusId)
      .eq('status', 'allocated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const alloc = (allocRaw ?? null) as AllocationWithBay | null;

    if (allocError || !alloc || !alloc.bays) {
      updateStatus('No active allocation found for this bus.');
      return;
    }

    if (alloc.bays.floor_id !== floor.id) {
      updateStatus(
        `Bus is on Level ${currentLevel}, but allocation is on a different level.`
      );
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: pendingBusId,
      floor_id: alloc.bays.floor_id,
      x: alloc.bays.x,
      y: alloc.bays.y,
      source: 'parked_correct',
    });

    if (posError) {
      updateStatus('Error inserting parked position: ' + posError.message);
      return;
    }

    updateStatus(
      `Bus moved to allocated bay ${alloc.bays.bay_code} on Level ${currentLevel}.`
    );
  };

  const handleMoveToRandomOpenSlot = async () => {
    if (!pendingBusId) {
      updateStatus('No active bus. Enter the depot and identify first.');
      return;
    }

    updateStatus('Moving bus to a random open slot on this level...');

    const { data: floor, error: floorError } = await supabase
      .from('depot_floors')
      .select('id, level_number')
      .eq('level_number', currentLevel)
      .maybeSingle();

    if (floorError || !floor) {
      updateStatus('Current level not configured in depot_floors.');
      return;
    }

    const { data: alloc, error: allocError } = await supabase
      .from('allocations')
      .select('bay_id')
      .eq('bus_id', pendingBusId)
      .eq('status', 'allocated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let bayQuery = supabase
      .from('bays')
      .select('id, bay_code, floor_id, x, y')
      .eq('floor_id', floor.id)
      .eq('is_available', true);

    if (!allocError && alloc?.bay_id) {
      bayQuery = bayQuery.neq('id', alloc.bay_id);
    }

    const { data: openBaysRaw, error: bayError } = await bayQuery;
    const openBays = (openBaysRaw ?? []) as BayForMove[];

    if (bayError || openBays.length === 0) {
      updateStatus('No other open bays on this level.');
      return;
    }

    const randomIndex = Math.floor(Math.random() * openBays.length);
    const randomBay = openBays[randomIndex];

    const busId = pendingBusId;

    await supabase
      .from('bays')
      .update({ is_available: true, current_bus_id: null })
      .eq('current_bus_id', busId);

    const { error: bayUpdateError } = await supabase
      .from('bays')
      .update({ is_available: false, current_bus_id: busId })
      .eq('id', randomBay.id);

    if (bayUpdateError) {
      updateStatus('Error updating wrong-slot bay: ' + bayUpdateError.message);
      return;
    }

    const { error: posError } = await supabase.from('bus_positions').insert({
      bus_id: busId,
      floor_id: randomBay.floor_id,
      x: randomBay.x,
      y: randomBay.y,
      source: 'parked_wrong',
    });

    if (posError) {
      updateStatus('Error inserting wrong-slot position: ' + posError.message);
      return;
    }

    updateStatus(
      `Bus moved to random open slot ${randomBay.bay_code} on Level ${currentLevel}.`
    );
  };

  /* ---------- JSX ---------- */

  // src/SimulationPanel.tsx (only JSX shown)

  return (
    <div className="panel panel-section">
      {/* Row 1: bus plate */}
      <div className="panel-body">
        <div className="simulation-section">
          <div className="field-row">
            <span className="field-label">Bus plate</span>
            <input
              className="text-input"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          </div>
        </div>

        {/* Row 2: enter/leave + identification */}
        <div className="simulation-section">
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleEnterDepot}>
              Enter depot
            </button>
            <button className="btn" onClick={handleLeaveDepot}>
              Leave depot
            </button>
            <button className="btn" onClick={handleAnprIdentify}>
              ANPR identification
            </button>
            <button className="btn" onClick={() => handleRfidFallback()}>
              Use RFID fallback
            </button>
          </div>
        </div>

        {/* Row 3: move to checkpoints */}
        <div className="simulation-section">
          <div className="button-row">
            <button className="btn" onClick={() => moveToCheckpoint('CP1')}>
              Move to CP1
            </button>
            <button className="btn" onClick={() => moveToCheckpoint('CP2')}>
              Move to CP2
            </button>
            <button className="btn" onClick={() => moveToCheckpoint('CP3')}>
              Move to CP3
            </button>
            <button className="btn" onClick={() => moveToCheckpoint('CP4')}>
              Move to CP4
            </button>
          </div>
        </div>

        {/* Row 4: level changes + allocation */}
        <div className="simulation-section">
          <div className="button-row">
            <button className="btn" onClick={() => handleLevelChange('up')}>
              Move up
            </button>
            <button className="btn" onClick={() => handleLevelChange('down')}>
              Move down
            </button>
            <button className="btn" onClick={handleMoveToAllocation}>
              Move to allocation
            </button>
            <button className="btn" onClick={handleMoveToRandomOpenSlot}>
              Move to random open slot
            </button>
          </div>
        </div>

        {/* Optional: status text inside panel */}
        {/* <p className="status-text simulation-status">{status}</p> */}
      </div>
    </div>
  );

}
