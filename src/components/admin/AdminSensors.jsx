import { useState, useEffect } from 'react';
import {
  subscribeToAllSensors,
  adminUpdateSensor,
  adminAddSensor,
  adminDeleteSensor,
} from '../../services/adminService';

const EMPTY_FORM = { name: '', latitude: '', longitude: '', waterLevel: '' };

export default function AdminSensors() {
  const [sensors, setSensors] = useState([]);
  const [editing, setEditing] = useState({});
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    return subscribeToAllSensors(setSensors);
  }, []);

  const startEdit = (sensor) => {
    setEditing((prev) => ({
      ...prev,
      [sensor.id]: {
        name: sensor.name || '',
        latitude: sensor.latitude ?? '',
        longitude: sensor.longitude ?? '',
        waterLevel: sensor.waterLevel ?? '',
      },
    }));
  };

  const cancelEdit = (id) => {
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveEdit = async (id) => {
    const fields = editing[id];
    await adminUpdateSensor(id, {
      name: fields.name,
      latitude: parseFloat(fields.latitude),
      longitude: parseFloat(fields.longitude),
      waterLevel: parseFloat(fields.waterLevel),
    });
    cancelEdit(id);
  };

  const handleAdd = async () => {
    if (!addForm.name) return;
    await adminAddSensor({
      name: addForm.name,
      latitude: parseFloat(addForm.latitude) || 0,
      longitude: parseFloat(addForm.longitude) || 0,
      waterLevel: parseFloat(addForm.waterLevel) || 0,
    });
    setAddForm(EMPTY_FORM);
    setShowAdd(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Flood Sensors</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-medium"
        >
          + Add Sensor
        </button>
      </div>

      {showAdd && (
        <div className="glass rounded-xl p-4 border border-[#00d4ff]/20 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Name"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            className="col-span-2 bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
          />
          <input
            placeholder="Latitude"
            value={addForm.latitude}
            onChange={(e) => setAddForm((f) => ({ ...f, latitude: e.target.value }))}
            className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
          />
          <input
            placeholder="Longitude"
            value={addForm.longitude}
            onChange={(e) => setAddForm((f) => ({ ...f, longitude: e.target.value }))}
            className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
          />
          <input
            placeholder="Water level (cm)"
            value={addForm.waterLevel}
            onChange={(e) => setAddForm((f) => ({ ...f, waterLevel: e.target.value }))}
            className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
          />
          <div className="flex gap-2 col-span-2">
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              Save
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-[#162d4d] text-slate-400 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sensors.map((sensor) => {
          const isEditing = !!editing[sensor.id];
          const draft = editing[sensor.id] || {};
          return (
            <div key={sensor.id} className="glass rounded-xl p-4 border border-[#162d4d]">
              {isEditing ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Name"
                    value={draft.name}
                    onChange={(e) => setEditing((p) => ({ ...p, [sensor.id]: { ...p[sensor.id], name: e.target.value } }))}
                    className="col-span-2 bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
                  />
                  <input
                    placeholder="Latitude"
                    value={draft.latitude}
                    onChange={(e) => setEditing((p) => ({ ...p, [sensor.id]: { ...p[sensor.id], latitude: e.target.value } }))}
                    className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
                  />
                  <input
                    placeholder="Longitude"
                    value={draft.longitude}
                    onChange={(e) => setEditing((p) => ({ ...p, [sensor.id]: { ...p[sensor.id], longitude: e.target.value } }))}
                    className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
                  />
                  <input
                    placeholder="Water level (cm)"
                    value={draft.waterLevel}
                    onChange={(e) => setEditing((p) => ({ ...p, [sensor.id]: { ...p[sensor.id], waterLevel: e.target.value } }))}
                    className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
                  />
                  <div className="flex gap-2 col-span-2">
                    <button onClick={() => saveEdit(sensor.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">Save</button>
                    <button onClick={() => cancelEdit(sensor.id)} className="px-3 py-1.5 rounded-lg bg-[#162d4d] text-slate-400 text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">{sensor.name || sensor.id}</p>
                    <p className="text-[11px] text-slate-400">
                      {sensor.latitude?.toFixed(4)}, {sensor.longitude?.toFixed(4)} · {sensor.waterLevel ?? '—'} cm
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(sensor)} className="px-3 py-1.5 rounded-lg bg-[#162d4d] text-slate-300 text-xs font-medium">Edit</button>
                    <button onClick={() => adminDeleteSensor(sensor.id)} className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium">Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {sensors.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">No sensors found.</p>
        )}
      </div>
    </div>
  );
}
