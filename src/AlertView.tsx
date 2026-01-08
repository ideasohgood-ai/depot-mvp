// src/AlertView.tsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

type AlertRow = {
    id: string;
    created_at: string;
    wrong_attempts: number;
    status: string;
    buses: {
        plate_number: string;
        needs_charging: boolean;
        needs_maintenance: boolean;
    } | null;
    allocated_bay: {
        bay_code: string;
        is_charging_bay: boolean;
        area_code: string;
        lot_number: number;
        depot_floors: { level_number: number } | null;
    } | null;
    override_bay: {
        bay_code: string;
        is_charging_bay: boolean;
        area_code: string;
        lot_number: number;
        depot_floors: { level_number: number } | null;
    } | null;
};


export function AlertView({ refreshToken }: { refreshToken: number }) {
    const [alerts, setAlerts] = useState<AlertRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<string | null>(null);

    const loadAlerts = async () => {
        setLoading(true);
        setStatus(null);

        const { data, error } = await supabase
            .from('allocations')
            .select(
                `
                id,
                created_at,
                status,
                wrong_attempts,
                buses:bus_id (
                plate_number,
                needs_charging,
                needs_maintenance
                ),
                allocated_bay:bay_id (
                bay_code,
                area_code,
                lot_number,
                is_charging_bay,
                depot_floors:floor_id ( level_number )
                ),
                override_bay:override_bay_id (
                bay_code,
                area_code,
                lot_number,
                is_charging_bay,
                depot_floors:floor_id ( level_number )
                )
            `
            )
            .gte('wrong_attempts', 3)          // show any allocation that ever hit 3+
            .order('created_at', { ascending: false });


        if (error || !data) {
            setStatus('Error loading alerts: ' + (error?.message ?? 'unknown'));
            setLoading(false);
            return;
        }

        setAlerts(data as unknown as AlertRow[]);
        setLoading(false);
    };

    useEffect(() => {
        loadAlerts();
    }, [refreshToken]);

    return (
        <div className="override-alerts-wrapper">
            {status && <p className="status-text">{status}</p>}
            {loading && <p className="status-text">Loading alerts…</p>}

            {!loading && alerts.length === 0 && (
                <p className="status-text">No override alerts at the moment.</p>
            )}

            {alerts.length > 0 && (
                <div className="alert-list">
                    {alerts.map((a) => {
                        const bus = a.buses;
                        const allocBay = a.allocated_bay;
                        const overrideBay = a.override_bay;
                        const allocLevel = allocBay?.depot_floors?.level_number ?? '?';
                        const overrideLevel = overrideBay?.depot_floors?.level_number ?? '?';
                        const chargingOk =
                            bus && overrideBay
                                ? !bus.needs_charging || overrideBay.is_charging_bay
                                : true;
                        const maintenanceOk = bus ? !bus.needs_maintenance : true;

                        const isHistorical = a.status === 'completed_departed';      // NEW
                        const statusLabel = isHistorical ? 'Historical incident' : 'Active incident';
                        const statusColor = isHistorical ? '#6b7280' : '#b91c1c';

                        return (
                            <div key={a.id} className="alert-card">
                                <div className="alert-header">
                                    <div>Bus plate: {bus?.plate_number ?? 'Unknown'}</div>
                                    <div className="alert-timestamp">
                                        {new Date(a.created_at).toLocaleTimeString()}
                                    </div>
                                </div>

                                <div className="alert-body">
                                    <div>
                                        Allocated bay:{' '}
                                        <strong>
                                            {allocBay?.bay_code ?? 'Unknown'} (L{allocLevel} · Area{' '}
                                            {allocBay?.area_code ?? '?'} · Lot {allocBay?.lot_number ?? '?'})
                                        </strong>
                                    </div>

                                    <div>
                                        Parked at:{' '}
                                        <strong>
                                            {overrideBay?.bay_code ?? 'Unknown'} (L{overrideLevel} · Area{' '}
                                            {overrideBay?.area_code ?? '?'} · Lot {overrideBay?.lot_number ?? '?'})
                                        </strong>
                                    </div>

                                    <div>Wrong attempts: {a.wrong_attempts}</div>

                                    {/* Last row: maintenance (left) + status (right) */}
                                    <div className="alert-footer-row">
                                        <div>
                                            Maintenance requirement:{' '}
                                            <span style={{ color: maintenanceOk ? '#16a34a' : '#dc2626' }}>
                                                {maintenanceOk ? 'OK' : 'Not OK'}
                                            </span>
                                        </div>

                                        <div className="alert-incident-status">
                                            <span style={{ color: statusColor, fontWeight: 600 }}>
                                                {statusLabel}
                                            </span>
                                            <span className="alert-raw-status">({a.status})</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
