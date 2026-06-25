import React from 'react';
import '../styles/hubs.css';

/**
 * Approved MUT campus meetup hubs.
 * All slots created through the Sell flow must use one of these locations.
 */
export const CAMPUS_HUBS = [
  {
    id: 'library_reception',
    name: 'Library Reception',
    description: 'Main library entrance, ground floor',
    icon: '📚',
    mapDesc: 'Central Library Building, Ground Floor Entrance',
  },
  {
    id: 'admin_foyer',
    name: 'Admin Foyer',
    description: 'Administration building main entrance',
    icon: '🏛️',
    mapDesc: 'Administration Building, Main Foyer',
  },
  {
    id: 'student_centre',
    name: 'Student Centre',
    description: 'Student hub, near the cafeteria',
    icon: '🎓',
    mapDesc: 'Student Centre Building, Main Entrance',
  },
  {
    id: 'computer_lab',
    name: 'Computer Lab Entrance',
    description: 'ICT building, lab corridor entrance',
    icon: '💻',
    mapDesc: 'ICT Building, Computer Lab Corridor',
  },
  {
    id: 'cafeteria',
    name: 'Cafeteria Entrance',
    description: 'Main campus cafeteria, front door',
    icon: '🍽️',
    mapDesc: 'Main Cafeteria, Front Entrance',
  },
  {
    id: 'security_gate',
    name: 'Security Gate',
    description: 'Main security gate, always staffed',
    icon: '🔒',
    mapDesc: 'Main Campus Security Gate',
  },
];

/**
 * MeetupHubPicker — Visual card selector for pre-approved campus meetup hubs.
 *
 * Props:
 *   value     {string}   — Currently selected hub id
 *   onChange  {function} — Called with the hub name string when a hub is selected
 */
export const MeetupHubPicker = ({ value, onChange }) => {
  const selectedHub = CAMPUS_HUBS.find((h) => h.name === value) || null;

  const handleSelect = (hub) => {
    onChange(hub.name);
  };

  return (
    <div className="hub-picker-wrap">
      <p className="hub-picker-label">Select a Campus Meetup Location</p>

      <div className="hub-grid" id="hubGrid">
        {CAMPUS_HUBS.map((hub) => {
          const isSelected = selectedHub?.id === hub.id;
          return (
            <div
              key={hub.id}
              id={`hub-${hub.id}`}
              className={`hub-card${isSelected ? ' selected' : ''}`}
              onClick={() => handleSelect(hub)}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Select ${hub.name} as meetup location`}
              onKeyDown={(e) => e.key === 'Enter' && handleSelect(hub)}
            >
              {isSelected && (
                <div className="hub-selected-check" aria-hidden="true">✓</div>
              )}
              <span className="hub-card-icon" aria-hidden="true">{hub.icon}</span>
              <div className="hub-card-name">{hub.name}</div>
              <div className="hub-card-desc">{hub.description}</div>
            </div>
          );
        })}
      </div>

      {/* Visual map placeholder */}
      <div className="hub-map-wrap" aria-label="Campus map showing selected location">
        {selectedHub ? (
          <>
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <span style={{ fontSize: 48 }} aria-hidden="true">{selectedHub.icon}</span>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#374151', fontWeight: 600 }}>
                {selectedHub.mapDesc}
              </p>
            </div>
            <div className="hub-map-location-label">
              📍 {selectedHub.name} — MUT Campus
            </div>
          </>
        ) : (
          <div className="hub-map-placeholder">
            <span className="map-icon" aria-hidden="true">🗺️</span>
            <p style={{ fontSize: 13, margin: 0 }}>Select a hub above to see its location</p>
          </div>
        )}
      </div>

      {/* Safety note */}
      <div className="hub-safety-note">
        <span className="safety-icon" aria-hidden="true">🛡️</span>
        <span>
          All meetup locations are pre-approved <strong>MUT campus safe zones</strong> with
          security presence or high foot traffic. Never agree to off-campus meetup requests.
        </span>
      </div>
    </div>
  );
};
