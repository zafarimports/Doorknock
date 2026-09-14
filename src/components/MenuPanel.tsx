import { useState } from 'react';
import DataTab from './DataTab';
import DoorList from './DoorList';
import TeamTab from './TeamTab';
import TurfTab from './TurfTab';

export type MenuSection = 'doors' | 'turf' | 'team' | 'data';

const SECTIONS: { id: MenuSection; label: string }[] = [
  { id: 'doors', label: 'Doors' },
  { id: 'turf', label: 'Turf' },
  { id: 'team', label: 'Team' },
  { id: 'data', label: 'List' },
];

interface Props {
  onClose: () => void;
  onOpenImport: () => void;
  initial?: MenuSection;
}

/** Everything that isn't the map, behind one button. */
export default function MenuPanel({ onClose, onOpenImport, initial = 'doors' }: Props) {
  const [section, setSection] = useState<MenuSection>(initial);

  return (
    <div className="sheet sheet--left" role="dialog" aria-label="Menu">
      <header className="sheet__head">
        <div className="segmented segmented--wide">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="sheet__body">
        {section === 'doors' && <DoorList />}
        {section === 'turf' && <TurfTab />}
        {section === 'team' && <TeamTab />}
        {section === 'data' && <DataTab onOpenImport={onOpenImport} />}
      </div>
    </div>
  );
}
