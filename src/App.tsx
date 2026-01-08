// src/App.tsx

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { SimulationPanel } from './SimulationPanel';
import { DepotMap } from './DepotMap';
import { DriverView } from './DriverView';
import { SlotAllocationDashboard } from './SlotAllocationDashboard';
import { AlertView } from './AlertView';
import './App.css';

type Bay = {
  id: string;
  bay_code: string;
  area_code: string;
  lot_number: number;
  is_available: boolean;
  is_charging_bay: boolean;
};

function App() {
  const [bays, setBays] = useState<Bay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [driverRefreshToken, setDriverRefreshToken] = useState(0);
  const [alertRefreshToken, setAlertRefreshToken] = useState(0);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);
  const [busSearchPlate, setBusSearchPlate] = useState('');

  useEffect(() => {
    const loadBays = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('bays')
        .select('id, bay_code, area_code, lot_number, is_available, is_charging_bay')
        .order('area_code', { ascending: true })
        .order('lot_number', { ascending: true });

      if (error) {
        console.error(error);
        setError(error.message);
      } else {
        setBays((data ?? []) as Bay[]);
      }

      setLoading(false);
    };

    loadBays();
  }, []);

  if (loading) {
    return <div>Loading bays...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  const handleLocateBusOnMap = async () => {
    const trimmed = busSearchPlate.trim().toUpperCase();
    if (!trimmed) return;

    // Find the bus row by plate
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id')
      .eq('plate_number', trimmed)
      .maybeSingle();

    if (busError || !bus) {
      setSimulationStatus(`Bus ${trimmed} not found.`);
      return;
    }

    // Latest position for this bus
    const { data: pos, error: posError } = await supabase
      .from('bus_positions')
      .select('floor_id')
      .eq('bus_id', bus.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (posError || !pos) {
      setSimulationStatus(`No position data for ${trimmed} yet.`);
      return;
    }

    // Map floor_id -> level_number
    const { data: floor, error: floorError } = await supabase
      .from('depot_floors')
      .select('level_number')
      .eq('id', pos.floor_id)
      .maybeSingle();

    if (floorError || !floor || !floor.level_number) {
      setSimulationStatus(`Cannot resolve level for ${trimmed}.`);
      return;
    }

    setCurrentLevel(floor.level_number);
    setSimulationStatus(`Bus ${trimmed} is on Level ${floor.level_number}.`);
  };


  return (
    <div className="app-root">
      <div className="app-container">
        <div className="app-main">
          {/* LEFT column */}
          <div className="left-column">
            <div className="app-header-row">
              <header className="app-header">
                <h1 className="app-title">Depot Bays MVP Demo</h1>
                <p className="app-subtitle">
                  Real-time depot view powered by Supabase data and simulated bus movement.
                </p>
              </header>

              <div className="panel simulation-status-panel">
                <h2 className="panel-title">Simulation status</h2>
                <p className="status-text">
                  {simulationStatus ?? 'Idle – no active bus in simulation.'}
                </p>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Slot Allocation</h2>
                <p className="panel-description">
                  View bay availability by level and assign or override allocations.
                </p>
              </div>
              <div className="panel-body">
                <SlotAllocationDashboard
                  notifyDriverRefresh={() => setDriverRefreshToken((v) => v + 1)}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Override Alerts</h2>
                <p className="panel-description">
                  Track buses parked away from allocated bays and check charging or maintenance
                  mismatches.
                </p>
              </div>
              <div className="panel-body">
                <AlertView refreshToken={alertRefreshToken} />
              </div>
            </div>
          </div>

          {/* RIGHT column */}
          <div className="right-column">
            {/* Top row: Simulation + Driver view */}
            <div className="right-top-row">
              <div className="panel right-half">
                <div className="panel-header">
                  <h2 className="panel-title">Simulation Panel</h2>
                  <p className="panel-description">
                    Step through the depot flow, move buses via checkpoints and auto-assign bays.
                  </p>
                </div>
                <div className="panel-body">
                  <SimulationPanel
                    setCurrentLevel={setCurrentLevel}
                    setTransitionMessage={setTransitionMessage}
                    notifyDriverRefresh={() => setDriverRefreshToken((v) => v + 1)}
                    notifyAlertRefresh={() => setAlertRefreshToken((v) => v + 1)}
                    onStatusChange={setSimulationStatus}
                  />
                </div>
              </div>

              <div className="panel right-half">
                <div className="panel-header">
                  <h2 className="panel-title">Driver View</h2>
                  <p className="panel-description">
                    Show the driver their assigned bay and capture parking confirmation.
                  </p>
                </div>
                <div className="panel-body">
                  <DriverView refreshToken={driverRefreshToken} />
                </div>
              </div>
            </div>

            {/* Bottom row: Depot map */}
            <div className="panel right-bottom">
              <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 className="panel-title">Depot Map</h2>
                  <p className="panel-description">
                    Visual map of bus positions in the depot by level and status.
                  </p>
                </div>

                {/* Find bus control on the right */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Plate e.g. SBS001A"
                    value={busSearchPlate}
                    onChange={(e) => setBusSearchPlate(e.target.value)}
                    className="text-input"
                    style={{ width: 150 }}
                  />
                  <button className="btn" onClick={handleLocateBusOnMap}>
                    Locate
                  </button>
                </div>
              </div>

              <div className="panel-body">
                <DepotMap
                  currentLevel={currentLevel}
                  isTransitioning={!!transitionMessage}
                  transitionMessage={transitionMessage}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
