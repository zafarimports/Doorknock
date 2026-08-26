import DataTab from './DataTab';
import DoorList from './DoorList';
import StatsBar from './StatsBar';
import TeamTab from './TeamTab';
import TurfTab from './TurfTab';

export type TabId = 'doors' | 'turf' | 'team' | 'data';

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'doors', label: 'Doors', icon: '🚪' },
  { id: 'turf', label: 'Turf', icon: '🗺' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'data', label: 'Data', icon: '⚙' },
];

interface Props {
  tab: TabId;
  onTab: (tab: TabId) => void;
  onOpenImport: () => void;
}

export default function Sidebar({ tab, onTab, onOpenImport }: Props) {
  return (
    <div className="sidebar">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} onClick={() => onTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <StatsBar />
      <div className="sidebar__body">
        {tab === 'doors' && <DoorList />}
        {tab === 'turf' && <TurfTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'data' && <DataTab onOpenImport={onOpenImport} />}
      </div>
    </div>
  );
}
