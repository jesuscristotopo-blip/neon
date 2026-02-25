import React from 'react';
import { NeonArena } from './components/NeonArena';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-black overflow-hidden relative text-white font-mono">
      <NeonArena />
    </div>
  );
};

export default App;