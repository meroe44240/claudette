import { motion } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 rounded-full bg-neutral-50 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="active-tab"
              className="absolute inset-0 rounded-full bg-[#7C5CFC]"
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          )}
          <span className={`relative z-10 ${activeTab === tab.id ? 'text-white font-semibold' : 'text-neutral-500'}`}>
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-300'}`}>
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
