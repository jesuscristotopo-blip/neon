import React, { useEffect, useRef, useState } from 'react';

interface VirtualJoystickProps {
  onMove: (x: number, y: number) => void;
  label?: string;
  color?: string;
  side?: 'left' | 'right'; // Optional now, mostly for default colors if needed
  style?: React.CSSProperties; // For custom positioning
  className?: string;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, label, color = 'cyan', side, style, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // Track the specific touch ID controlling this joystick
  const touchIdRef = useRef<number | null>(null);
  
  const maxRadius = 50; 

  const updateStick = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxRadius);
    const angle = Math.atan2(dy, dx);

    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    setPosition({ x, y });

    const normX = x / maxRadius;
    const normY = y / maxRadius;
    onMove(normX, normY);
  };

  const resetStick = () => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
    touchIdRef.current = null;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Touch Handlers ---
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      // If already active, ignore new touches
      if (touchIdRef.current !== null) return;

      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      setActive(true);
      updateStick(touch.clientX, touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (touchIdRef.current === null) return;

      // Find our specific touch
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          const touch = e.changedTouches[i];
          updateStick(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (touchIdRef.current === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          resetStick();
          break;
        }
      }
    };

    // --- Mouse Handlers (for desktop testing) ---
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setActive(true);
      updateStick(e.clientX, e.clientY);
    };
    
    const onMouseMove = (e: MouseEvent) => {
      if (active) {
        e.preventDefault();
        updateStick(e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      if (active) {
        resetStick();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);

      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [active]);

  // Default positioning removed, handled by parent via style prop
  return (
    <div 
      ref={containerRef}
      className={`absolute w-36 h-36 rounded-full border border-opacity-30 flex items-center justify-center backdrop-blur-sm transition-all duration-300 select-none touch-none ${active ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-80'} ${className || ''}`}
      style={{ 
        borderColor: color, 
        boxShadow: active ? `0 0 25px ${color}40, inset 0 0 15px ${color}20` : 'none',
        background: active ? `radial-gradient(circle, ${color}10 0%, transparent 70%)` : 'transparent',
        ...style 
      }}
    >
      {/* Tech Ring Decor */}
      <div className="absolute inset-0 rounded-full border border-white/10 scale-90 pointer-events-none"></div>
      <div className="absolute inset-0 rounded-full border border-white/5 scale-75 pointer-events-none"></div>
      
      {/* Crosshairs */}
      <div className="absolute w-full h-[1px] bg-white/10 pointer-events-none"></div>
      <div className="absolute h-full w-[1px] bg-white/10 pointer-events-none"></div>

      <div 
        ref={stickRef}
        className="w-12 h-12 rounded-full shadow-lg absolute pointer-events-none border border-white/30 flex items-center justify-center"
        style={{ 
          backgroundColor: active ? color : `${color}80`,
          transform: `translate(${position.x}px, ${position.y}px)`,
          boxShadow: `0 0 20px ${color}, inset 0 2px 10px rgba(255,255,255,0.5)`
        }}
      >
          {/* Stick Inner Detail */}
          <div className="w-4 h-4 rounded-full bg-white/80 shadow-sm"></div>
      </div>
      
      {label && (
        <span className="absolute -top-8 text-[10px] font-black tracking-[0.2em] uppercase opacity-80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none bg-black/40 px-2 py-0.5 rounded border border-white/10" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  );
};