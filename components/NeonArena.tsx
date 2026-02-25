
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { VirtualJoystick } from './VirtualJoystick';
import { audioService } from '../services/audioService';

import { multiplayerService } from '../services/multiplayerService';

// --- Helper Functions ---
export const addAlphaToColor = (color: string, alpha: number | string): string => {
    let numAlpha: number;
    if (typeof alpha === 'string' && alpha.length === 2) {
        numAlpha = parseInt(alpha, 16) / 255;
    } else {
        numAlpha = Number(alpha);
    }

    if (color.startsWith('#')) {
        // If it's hex, we can just append hex alpha if we want, but rgba is safer for all browsers
        let r = 0, g = 0, b = 0;
        if (color.length === 4) {
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        } else if (color.length === 7) {
            r = parseInt(color.substring(1, 3), 16);
            g = parseInt(color.substring(3, 5), 16);
            b = parseInt(color.substring(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${numAlpha.toFixed(2)})`;
    } else if (color.startsWith('hsl')) {
        if (color.startsWith('hsla')) {
            return color.replace(/hsla\(([^,]+),([^,]+),([^,]+),([^)]+)\)/, `hsla($1,$2,$3,${numAlpha.toFixed(2)})`);
        }
        return color.replace('hsl', 'hsla').replace(')', `, ${numAlpha.toFixed(2)})`);
    } else if (color.startsWith('rgb')) {
        if (color.startsWith('rgba')) {
            return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/, `rgba($1,$2,$3,${numAlpha.toFixed(2)})`);
        }
        return color.replace('rgb', 'rgba').replace(')', `, ${numAlpha.toFixed(2)})`);
    }
    return color;
};

// --- Types & Constants ---
const BASE_ARENA_RADIUS = 30000; 
const TRAIL_SPACING = 6;
const MAX_LIVES = 3; 

const HEALING_STATION_COUNT = 8; 
const HEAL_RADIUS = 400; 
const DOCK_RADIUS = 60; 
const PASSIVE_REGEN = 0.03; 
const STATION_COOLDOWN = 40 * 60; 
const STATION_COLORS = ['#00ffff', '#ff00ff', '#44ff00', '#ffaa00', '#0088ff']; 
const RADAR_VISIBILITY_MS = 2500; // Tempo que o inimigo fica visível no radar após atirar

// PHYSICS ADJUSTMENTS
const ACCELERATION = 1.2; 
const FRICTION = 0.96;
const DRIFT_FRICTION = 0.985;
const BOOST_SPEED = 55; 
const GRAVITY = 1.5; 

const JUMP_COOLDOWN_FRAMES = 60 * 60; 
const TONGUE_COOLDOWN_FRAMES = 15 * 60; 
const STEALTH_COOLDOWN_FRAMES = 60 * 60; 
const FIRE_COOLDOWN_FRAMES = 60 * 60; 

// RESPAWN SETTINGS
const RESPAWN_TIME_SECONDS = 10;
const RESPAWN_FRAMES = RESPAWN_TIME_SECONDS * 60;

const START_SCORE = 0;
const MAX_BOOST = 100;
const BOOST_DRAIN = 0.8; 
const BOOST_REGEN = 0.5; 
const RELOAD_TIME = 120; 
const MAP_ORB_COUNT = 150; 

// OPTIMIZATION CONSTANTS
const SPATIAL_GRID_SIZE = 500; 
const RENDER_CULL_MARGIN = 200; 

// --- ADVANCED SKIN SYSTEM ---
type SkinType = 'SOLID' | 'GRADIENT' | 'RAINBOW' | 'HACKER' | 'VOID' | 'PLASMA' | 'GOLD' | 'NEG' | 'GLITCH';

interface SkinDefinition {
    id: string;
    name: string;
    type: SkinType;
    colors: string[]; // Primary, Secondary, etc.
    glowColor: string;
    trailType: 'STANDARD' | 'MATRIX' | 'RAINBOW' | 'FIRE' | 'VOID';
    projectileColor?: { core: string; glow: string };
    rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
    price: number;
}

const SKINS: SkinDefinition[] = [
    // COMMONS (Solids)
    { id: 'cyan', name: "NEON CYAN", type: 'SOLID', colors: ['#00f3ff'], glowColor: '#00f3ff', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'red', name: "CRIMSON", type: 'SOLID', colors: ['#ff003c'], glowColor: '#ff003c', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'lime', name: "TOXIC LIME", type: 'SOLID', colors: ['#ccff00'], glowColor: '#ccff00', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'purple', name: "ROYAL VIOLET", type: 'SOLID', colors: ['#bf00ff'], glowColor: '#bf00ff', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'orange', name: "BLAZE ORANGE", type: 'SOLID', colors: ['#ff8800'], glowColor: '#ff8800', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'pink', name: "HOT PINK", type: 'SOLID', colors: ['#ff00ff'], glowColor: '#ff00ff', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'white', name: "PURE WHITE", type: 'SOLID', colors: ['#ffffff'], glowColor: '#ffffff', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    { id: 'blue', name: "DEEP BLUE", type: 'SOLID', colors: ['#0044ff'], glowColor: '#0044ff', trailType: 'STANDARD', rarity: 'COMMON', price: 0 },
    
    // RARE (Dual Tones / Gradients)
    { id: 'sunset', name: "SYNTH SUNSET", type: 'GRADIENT', colors: ['#ff00ff', '#ffaa00'], glowColor: '#ff00aa', trailType: 'STANDARD', rarity: 'RARE', price: 2000 },
    { id: 'ocean', name: "ABYSSAL", type: 'GRADIENT', colors: ['#0000ff', '#00ffff'], glowColor: '#0088ff', trailType: 'STANDARD', rarity: 'RARE', price: 2000 },
    { id: 'forest', name: "BIOLUMINESCENT", type: 'GRADIENT', colors: ['#00ff00', '#004400'], glowColor: '#00ff44', trailType: 'STANDARD', rarity: 'RARE', price: 2000 },
    { id: 'fireice', name: "THERMAL SHOCK", type: 'GRADIENT', colors: ['#ff0000', '#00ffff'], glowColor: '#ffffff', trailType: 'FIRE', rarity: 'RARE', price: 2500 },
    { id: 'bumblebee', name: "HAZARD", type: 'GRADIENT', colors: ['#ffd700', '#111111'], glowColor: '#ffd700', trailType: 'STANDARD', rarity: 'RARE', price: 2000 },

    // EPIC (Animated / Special)
    { id: 'plasma', name: "PLASMA FLUX", type: 'PLASMA', colors: ['#ff00cc', '#00ffff'], glowColor: '#ff88ff', trailType: 'STANDARD', rarity: 'EPIC', price: 5000 },
    { id: 'gold', name: "MIDAS TOUCH", type: 'GOLD', colors: ['#ffd700', '#ffaa00'], glowColor: '#ffd700', trailType: 'STANDARD', rarity: 'EPIC', price: 6000 },
    { id: 'midnight', name: "MIDNIGHT RUN", type: 'GRADIENT', colors: ['#111111', '#4400ff'], glowColor: '#4400ff', trailType: 'STANDARD', rarity: 'EPIC', price: 5000 },
    { id: 'bloodmoon', name: "BLOOD MOON", type: 'GRADIENT', colors: ['#440000', '#ff0000'], glowColor: '#ff0000', trailType: 'FIRE', rarity: 'EPIC', price: 5500 },
    { id: 'cottoncandy', name: "SUGAR RUSH", type: 'GRADIENT', colors: ['#ff99ff', '#99ffff'], glowColor: '#ffffff', trailType: 'STANDARD', rarity: 'EPIC', price: 5000 },
    { id: 'storm', name: "STORM CHASER", type: 'PLASMA', colors: ['#00ffff', '#ffffff'], glowColor: '#00ffff', trailType: 'STANDARD', rarity: 'EPIC', price: 5200 },
    { id: 'magma', name: "MAGMA CORE", type: 'GRADIENT', colors: ['#ff4400', '#ff0000'], glowColor: '#ff8800', trailType: 'FIRE', rarity: 'EPIC', price: 5800 },
    { id: 'cyberghost', name: "CYBER GHOST", type: 'HACKER', colors: ['#00ff00', '#000000'], glowColor: '#00ff00', trailType: 'MATRIX', rarity: 'EPIC', price: 6500 },
    { id: 'neonpulse', name: "NEON PULSE", type: 'GRADIENT', colors: ['#ff00ff', '#00ffff'], glowColor: '#ffffff', trailType: 'RAINBOW', rarity: 'EPIC', price: 7000 },
    { id: 'glitchmode', name: "GLITCH MODE", type: 'GLITCH', colors: ['#ff00ff', '#00ff00', '#00ffff'], glowColor: '#ffffff', trailType: 'MATRIX', rarity: 'EPIC', price: 7500 },
    { id: 'overdrive', name: "OVERDRIVE", type: 'PLASMA', colors: ['#ffff00', '#ff0000'], glowColor: '#ffff00', trailType: 'FIRE', rarity: 'EPIC', price: 6200 },
    { id: 'deepsea', name: "DEEP SEA", type: 'GRADIENT', colors: ['#000044', '#00ffff'], glowColor: '#00ffff', trailType: 'STANDARD', rarity: 'EPIC', price: 5400 },

    // LEGENDARY (Complex Effects)
    { id: 'rainbow', name: "RGB OVERLOAD", type: 'RAINBOW', colors: [], glowColor: '#ffffff', trailType: 'RAINBOW', rarity: 'LEGENDARY', price: 10000 },
    { id: 'void', name: "THE VOID", type: 'VOID', colors: ['#000000', '#ffffff'], glowColor: '#ffffff', trailType: 'VOID', projectileColor: {core: '#000000', glow: '#ffffff'}, rarity: 'LEGENDARY', price: 12000 },
    { id: 'hacker', name: "MAINFRAME", type: 'HACKER', colors: ['#00ff00', '#003300'], glowColor: '#00ff00', trailType: 'MATRIX', rarity: 'LEGENDARY', price: 15000 },
    { id: 'negative', name: "INVERTED", type: 'NEG', colors: ['#ffffff', '#000000'], glowColor: '#000000', trailType: 'VOID', projectileColor: {core: '#ffffff', glow: '#000000'}, rarity: 'LEGENDARY', price: 12000 },
    
    // MYTHIC
    { id: 'nebula', name: "COSMIC DUST", type: 'GRADIENT', colors: ['#ff00cc', '#00ffff', '#ffff00'], glowColor: '#ffffff', trailType: 'RAINBOW', rarity: 'MYTHIC', price: 25000 },
    { id: 'glitch', name: "SYS_FAILURE", type: 'HACKER', colors: ['#ff00ff', '#00ffff'], glowColor: '#ffffff', trailType: 'MATRIX', rarity: 'MYTHIC', price: 30000 },
    { id: 'darkmatter', name: "DARK MATTER", type: 'VOID', colors: ['#110022', '#ff00ff'], glowColor: '#aa00ff', trailType: 'VOID', rarity: 'MYTHIC', price: 28000 },
    { id: 'superuser', name: "ROOT ACCESS", type: 'HACKER', colors: ['#ff0000', '#000000'], glowColor: '#ff0000', trailType: 'MATRIX', rarity: 'MYTHIC', price: 30000 },
    { id: 'divine', name: "DIVINE LIGHT", type: 'SOLID', colors: ['#ffffff'], glowColor: '#ffffaa', trailType: 'FIRE', projectileColor: {core: '#ffffff', glow: '#ffff00'}, rarity: 'MYTHIC', price: 35000 },
    { id: 'arcade', name: "RETRO WAVE", type: 'GRADIENT', colors: ['#ff0055', '#5500ff'], glowColor: '#ff0055', trailType: 'RAINBOW', rarity: 'MYTHIC', price: 25000 },
    
    // NEW CINEMATIC SKINS
    { id: 'shadowflame', name: "SHADOWFLAME", type: 'GRADIENT', colors: ['#110011', '#440044'], glowColor: '#aa00ff', trailType: 'FIRE', rarity: 'LEGENDARY', price: 18000 },
    { id: 'celestial', name: "CELESTIAL", type: 'SOLID', colors: ['#ffffff'], glowColor: '#ffd700', trailType: 'STANDARD', rarity: 'MYTHIC', price: 32000 },
    { id: 'cyberpunk', name: "CYBERPUNK", type: 'GRADIENT', colors: ['#00f3ff', '#ff00ff'], glowColor: '#00f3ff', trailType: 'MATRIX', rarity: 'LEGENDARY', price: 16000 },
    { id: 'toxic', name: "TOXIC HAZARD", type: 'GRADIENT', colors: ['#111111', '#00ff00'], glowColor: '#00ff00', trailType: 'STANDARD', rarity: 'EPIC', price: 8000 },
];

const RARITY_COLORS = {
    'COMMON': '#888888',
    'RARE': '#00aaff',
    'EPIC': '#a300ff',
    'LEGENDARY': '#ffd700',
    'MYTHIC': '#ff0055'
};

// --- CAR CLASSES DEFINITION ---
type CarAbility = 'none' | 'sniper' | 'jump' | 'ram' | 'stealth' | 'shield';
type Rarity = 'COMMON' | 'EPIC' | 'LEGENDARY';

export interface CarStats {
    name: string;
    speed: number;
    health: number;
    damage: number;
    fireRate: number;
    rarity: Rarity;
    price: number;
    
    baseSpeed: number;
    baseHealth: number;
    baseDamage: number;
    baseFireRate: number; 
    baseDefense: number; // 0.0 to 1.0 (percent reduction)
    baseRegen: number;
    weight: number; 
    bulletSpeed: number;
    bulletSize: number;
    width: number;
    length: number;
    ability: CarAbility;
    secondaryAbility?: 'tongue' | 'fire_breath';
    description: string;
    range: number; 
    projectileType?: 'plasma' | 'bullet';
}

const CAR_TYPES: CarStats[] = [
    { name: "VORTEX", speed: 7, health: 6, damage: 5, fireRate: 6, rarity: 'COMMON', price: 0, baseSpeed: 16, baseHealth: 200, baseDamage: 12, baseFireRate: 15, baseDefense: 0.1, baseRegen: 0.03, weight: 1.0, bulletSpeed: 45, bulletSize: 60, width: 38, length: 65, ability: 'none', description: "BALANCED FIGHTER", range: 600 },
    { name: "VOLTAGE", speed: 8, health: 5, damage: 3, fireRate: 10, rarity: 'COMMON', price: 1500, baseSpeed: 18, baseHealth: 170, baseDamage: 8, baseFireRate: 5, baseDefense: 0.05, baseRegen: 0.03, weight: 0.9, bulletSpeed: 50, bulletSize: 30, width: 34, length: 55, ability: 'none', description: "RAPID FIRE", range: 500, projectileType: 'plasma' },
    { name: "TITAN", speed: 3, health: 10, damage: 8, fireRate: 3, rarity: 'COMMON', price: 2500, baseSpeed: 10, baseHealth: 360, baseDamage: 25, baseFireRate: 40, baseDefense: 0.4, baseRegen: 0.03, weight: 2.5, bulletSpeed: 35, bulletSize: 100, width: 55, length: 75, ability: 'none', description: "HEAVY TANK", range: 550 },
    { name: "RAZOR", speed: 9, health: 7, damage: 4, fireRate: 7, rarity: 'EPIC', price: 8000, baseSpeed: 20, baseHealth: 280, baseDamage: 20, baseFireRate: 12, baseDefense: 0.2, baseRegen: 0.05, weight: 1.2, bulletSpeed: 40, bulletSize: 50, width: 42, length: 68, ability: 'ram', description: "MELEE SPIKES", range: 450 },
    { name: "COBRA", speed: 9, health: 4, damage: 6, fireRate: 6, rarity: 'EPIC', price: 9500, baseSpeed: 21, baseHealth: 200, baseDamage: 25, baseFireRate: 18, baseDefense: 0.05, baseRegen: 0.05, weight: 0.8, bulletSpeed: 48, bulletSize: 50, width: 32, length: 62, ability: 'none', description: "AGILE STRIKER", range: 550 },
    { name: "FROG", speed: 8, health: 5, damage: 6, fireRate: 5, rarity: 'EPIC', price: 10000, baseSpeed: 17, baseHealth: 220, baseDamage: 25, baseFireRate: 20, baseDefense: 0.2, baseRegen: 0.05, weight: 1.1, bulletSpeed: 35, bulletSize: 55, width: 45, length: 55, ability: 'jump', secondaryAbility: 'tongue', description: "SLAM JUMP / GRAPPLE TONGUE", range: 500 },
    { name: "PHANTOM", speed: 7, health: 5, damage: 6, fireRate: 5, rarity: 'EPIC', price: 11000, baseSpeed: 17, baseHealth: 220, baseDamage: 25, baseFireRate: 20, baseDefense: 0.15, baseRegen: 0.05, weight: 1.0, bulletSpeed: 45, bulletSize: 55, width: 36, length: 70, ability: 'stealth', description: "GHOST OPS", range: 600 },
    { name: "EAGLE", speed: 6, health: 4, damage: 10, fireRate: 2, rarity: 'EPIC', price: 12000, baseSpeed: 15, baseHealth: 200, baseDamage: 65, baseFireRate: 60, baseDefense: 0.1, baseRegen: 0.05, weight: 0.9, bulletSpeed: 80, bulletSize: 40, width: 34, length: 70, ability: 'sniper', description: "LONG RANGE SNIPER", range: 1400 },
    { name: "NOVA", speed: 10, health: 2, damage: 9, fireRate: 1, rarity: 'LEGENDARY', price: 30000, baseSpeed: 22, baseHealth: 250, baseDamage: 60, baseFireRate: 80, baseDefense: 0.1, baseRegen: 0.1, weight: 0.6, bulletSpeed: 75, bulletSize: 45, width: 28, length: 50, ability: 'none', description: "GLASS CANNON / DUAL SHOT", range: 800, projectileType: 'plasma' },
    { name: "REI DO INFERNO", speed: 8, health: 9, damage: 9, fireRate: 9, rarity: 'LEGENDARY', price: 50000, baseSpeed: 19, baseHealth: 600, baseDamage: 45, baseFireRate: 7, baseDefense: 0.55, baseRegen: 0.25, weight: 1.8, bulletSpeed: 60, bulletSize: 50, width: 44, length: 72, ability: 'stealth', secondaryAbility: 'fire_breath', description: "STEALTH / FLAMETHROWER", range: 600 },
];

// Helper to avoid crashes if index is out of bounds
const getCarStats = (index: number) => {
    if (index < 0 || index >= CAR_TYPES.length) return CAR_TYPES[0];
    return CAR_TYPES[index];
};

const getSkin = (index: number) => {
    if (index < 0 || index >= SKINS.length) return SKINS[0];
    return SKINS[index];
};

const BOT_NAMES = ["CYPHER", "BLITZ", "NEXUS", "KAIJU", "STORM", "VIPER", "OMEGA", "SHADOW", "CRIMSON", "ZERO", "TITAN", "AXEL", "ROGUE", "PHOENIX"];

const COLORS = {
  darkBg: '#050505',
  grid: '#111116',
};

// HUD Layout Types
interface HUDPosition { x: number; y: number; }
interface HUDLayout {
    driveStick: HUDPosition;
    fireStick: HUDPosition;
    boostBtn: HUDPosition;
    ability1Btn: HUDPosition;
    ability2Btn: HUDPosition;
    zoomSlider: HUDPosition;
    powerStackBtn: HUDPosition;
}

interface Point { x: number; y: number; }

interface GroundDecal {
    x: number; y: number; scale: number; color: string; alpha: number; life: number; maxLife: number; rotation: number;
    type: 'splatter' | 'scorch' | 'puddle' | 'skid';
}

interface VisualTrailSegment { x: number; y: number; color: string; alpha: number; width?: number; }

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number;
  type?: 'spark' | 'smoke' | 'fire' | 'shockwave' | 'debris' | 'impact' | 'fluid' | 'heal_orb' | 'matrix_char' | 'energy_swirl' | 'shell' | 'emoji';
  rotation?: number; rotationSpeed?: number;
  char?: string; // For Matrix effect
  orbitAngle?: number; 
  orbitDist?: number;
  z?: number; vz?: number; // 3D Physics
}

interface Bullet {
  x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; damage: number;
  ownerId: string; ownerTeamId: number; ownerName: string; bounces: boolean; bounceCount?: number;
  projectileCoreColor?: string;
  bType?: string; // Added for custom rendering styles
}

// --- POWER UP SYSTEM ---
type PowerUpType = 'NONE' | 'DAMAGE' | 'SHIELD' | 'RAPID' | 'GHOST';

const POWER_COLORS: Record<PowerUpType, string> = {
    'NONE': '#ffffff',
    'DAMAGE': '#ff0000', // Red
    'SHIELD': '#ffd700', // Gold
    'RAPID': '#ffff00', // Yellow
    'GHOST': '#aa00ff'  // Purple
};

const POWER_DURATIONS: Record<PowerUpType, number> = {
    'NONE': 0,
    'DAMAGE': 600,
    'SHIELD': 300, // 5s
    'RAPID': 480, // 8s
    'GHOST': 600
};

interface Orb {
    id: string; x: number; y: number; value: number; color: string; vx: number; vy: number; animOffset: number; life: number; isMapOrb: boolean;
    powerType: PowerUpType;
}

interface HealingStation {
    id: string; x: number; y: number; color: string; animOffset: number; active: boolean; cooldownTimer: number; occupantId: string | null; 
}

interface SpeedLine { x: number; y: number; length: number; speed: number; alpha: number; }
interface KillLogEntry { id: string; text: string; life: number; }
interface Announcement { text: string; subText?: string; life: number; scale: number; color: string; }
interface DamageText { x: number; y: number; value: number; life: number; color: string; velocityY: number; scale: number; }

interface CarUpgradeState {
    speed: number;
    health: number;
    damage: number;
    fireRate: number;
    nitroSpeed: number;
    ammo: number;
    radarRange: number;
}

export interface CarEntity {
  id: string; name?: string; teamId: number; typeIndex: number; skinIndex: number; 
  x: number; y: number; z: number; vx: number; vy: number; vz: number; angle: number; steering: number; turretAngle: number;
  lastShot: number; health: number; maxHealth: number; lives: number; isDead: boolean; respawnTimer: number; spawnAnim: number; score: number;
  totalKills: number; killStreak: number; lastKillTime: number; ammo: number; maxAmmo: number; reloadTimer: number;
  muzzleFlashTimer: number; hitMarkerTimer: number; damageFlash: number; isBoosting: boolean; boostFuel: number;
  isDrifting: boolean; driftTimer: number; lastHealTime: number; isDocked: boolean; dockTimer: number; 
  ability1Charges: number; ability1Cooldown: number; ability1ActiveTimer: number;
  ability2Charges: number; ability2Cooldown: number; ability2ActiveTimer: number;
  isJumping: boolean; isStealth: boolean;
  tongueState: 'idle' | 'out' | 'pull' | 'in'; tongueTargetId: string | null; tongueLength: number; tongueMaxLen: number; tongueAngle: number;
  aiState?: 'wander' | 'chase' | 'flee' | 'collect' | 'heal'; aiTarget?: Point; aiChangeTimer?: number; aiReactionTimer?: number; tickOffset: number;
  visualTrails: VisualTrailSegment[][];
  
  // Instance Stats (Upgraded)
  statSpeed: number;
  statDamage: number;
  statFireRate: number;
  statNitroSpeed: number;
  baseRegen: number;
  radarRange: number;
  
  // Power Ups
  activePower: PowerUpType;
  powerTimer: number;
  powerInventory: PowerUpType[];
  
  // Visuals
  wheelAngle: number;
  energySwirlTimer: number;
  chargeLevel: number; // For charging weapons like Tank
  
  // Cinematic UI
  tagPos: { x: number; y: number; vx: number; vy: number };
  visualHealth: number;
  likes: number;
  dislikes: number;
  killerId: string | null;
}

export interface LeaderboardEntry {
    name: string;
    score: number;
    kills: number;
    energy: number;
    isPlayer: boolean;
    teamId: number;
    carType: number;
}

interface UserProfile {
    id: string; totalKills: number; matchesPlayed: number; favoriteCarIndex: number; clanName: string; clanMembers: string[]; currency: number; ownedCars: number[]; ownedSkins: string[];
    upgrades: Record<number, CarUpgradeState>;
}

type MatchState = 'COUNTDOWN' | 'PLAYING' | 'VICTORY' | 'GAMEOVER';

interface GameState {
  matchState: MatchState; matchTimer: number;
  player: CarEntity; bots: CarEntity[]; bullets: Bullet[]; particles: Particle[]; groundDecals: GroundDecal[]; 
  orbs: Orb[]; stations: HealingStation[]; deadSpots: {x: number, y: number, life: number}[]; speedLines: SpeedLine[]; 
  killLog: KillLogEntry[]; announcement: Announcement | null; damageTexts: DamageText[];
  camera: { x: number; y: number; zoom: number; shakeX: number; shakeY: number; shakeTrauma: number; offsetTargetX: number; offsetTargetY: number; offsetX: number; offsetY: number; spectateTargetId: string | null; };
  input: { moveX: number; moveY: number; aimX: number; aimY: number; isShooting: boolean; isBoosting: boolean; isAbility1Pressed: boolean; isAbility2Pressed: boolean; aimSource: 'joystick' | 'touch'; };
  menu: { 
      scrollX: number; targetScrollX: number; isDragging: boolean; lastDragX: number; rotation: number; 
      viewState: 'OVERVIEW' | 'DETAIL';
      cameraZoom: number; cameraYOffset: number;
      transitionProgress: number; // 0 = OVERVIEW, 1 = DETAIL
  };
  isPaused: boolean; isSpectating: boolean; showMapOverlay: boolean; hudLayout: HUDLayout; zoomInteracting: boolean; currentArenaRadius: number;
  lastPinchDist: number; // For multi-touch zoom
  powerSpawnTimer: number;
  powerStackInteraction: { isDragging: boolean; startX: number; startY: number; dragX: number; dragY: number; activeIndex: number; };
  gameMode: GameMode;
}

type MenuTab = 'GARAGE' | 'PROFILE' | 'CLAN';
type GameMode = 'SOLO' | 'DUO' | 'TRIO' | 'SQUAD' | 'MULTIPLAYER';

const TRANSLATIONS = {
    EN: {
        DRIVER: "DRIVER",
        CREDITS: "CREDITS",
        KILLS: "KILLS",
        OPERATION: "OPERATION",
        NETWORK: "NETWORK",
        MULTIPLAYER: "MULTIPLAYER",
        DEPLOY: "DEPLOY",
        UNLOCK: "UNLOCK",
        TAP_CAR_TO_TUNE: "TAP CAR TO TUNE",
        SETTINGS: "SETTINGS",
        LANGUAGE: "LANGUAGE",
        PLAYER_ID: "PLAYER ID",
        PLAYER_NAME: "PLAYER NAME",
        CLOSE: "CLOSE",
        PUBLIC_ROOMS: "PUBLIC ROOMS",
        REFRESH: "REFRESH",
        JOIN: "JOIN",
        CREATE_ROOM: "CREATE ROOM",
        JOIN_PRIVATE: "JOIN PRIVATE",
        ROOM_NAME: "Room Name",
        PRIVATE_ROOM: "Private Room",
        PASSWORD: "Password",
        CREATE: "CREATE",
        ROOM_ID: "Room ID",
        LEAVE_ROOM: "LEAVE ROOM",
        TOGGLE_READY: "TOGGLE READY",
        START_GAME: "START GAME",
        READY: "READY",
        NOT_READY: "NOT READY",
        HOST: "HOST",
        WAITING: "WAITING",
        VICTORY: "TEAM VICTORY",
        DEFEAT: "MISSION ABORTED",
        MISSION_REPORT: "MISSION REPORT",
        TOTAL_SCORE: "TOTAL SCORE",
        ELIMINATIONS: "ELIMINATIONS",
        ENERGY_COLLECTED: "ENERGY COLLECTED",
        PILOT: "PILOT",
        SCORE: "SCORE",
        ENERGY: "ENERGY",
        PLAY_AGAIN: "PLAY AGAIN",
        BACK_TO_MENU: "BACK TO MENU",
        SHARE: "SHARE",
        SYSTEM_PAUSED: "SYSTEM PAUSED",
        RESUME_COMBAT: "RESUME COMBAT",
        CONFIGURE_HUD: "CONFIGURE HUD",
        ABORT_MISSION: "ABORT MISSION",
        CONFIRM_ABORT: "Confirm Abort?",
        YES: "YES",
        NO: "NO",
        ALIVE: "ALIVE",
        TOP_5: "TOP 5",
        PAUSE: "PAUSE",
        LEADERBOARD: "LEADERBOARD",
        SPECTATING: "Spectating",
        LIKE: "LIKE",
        DISLIKE: "DISLIKE",
        DRAG_TO_REPOSITION: "DRAG TO REPOSITION HUD",
        MOVE: "MOVE",
        AIM: "AIM",
        BOOST: "BOOST",
        ABIL_1: "ABIL 1",
        ABIL_2: "ABIL 2",
        RESET: "RESET",
        SAVE_CLOSE: "SAVE & CLOSE",
        NITRO: "NITRO",
        INITIALIZING: "INITIALIZING",
        CONNECTING: "CONNECTING TO GLOBAL ARENA...",
        ESTABLISHING_LINK: "ESTABLISHING LINK...",
        OPTIMIZING: "OPTIMIZING ASSETS...",
        SYNCHRONIZING: "SYNCHRONIZING TEAM DATA...",
        COMPILING: "COMPILING SHADERS...",
        CALIBRATING: "CALIBRATING SENSORS...",
        LAUNCHING: "LAUNCHING COMBAT PROTOCOL...",
        TACTICAL_INTEL: "TACTICAL INTEL",
        TIP_1: "Drifting fills your Nitro gauge faster.",
        TIP_2: "Collect blue orbs to upgrade your weapon power.",
        TIP_3: "Stay close to teammates to cover blind spots.",
        TIP_4: "Shields regenerate after avoiding damage for a while.",
        TIP_5: "Different cars have unique handling characteristics.",
        INVITE_ALLY: "INVITE ALLY",
        PLAYER_ID_NAME: "Player ID / Name",
        ENTER_ID: "ENTER ID...",
        INVITE: "INVITE",
        OR: "OR",
        ADD_AI_BOT: "ADD AI BOT",
        CANCEL: "CANCEL",
        PLAYER: "PLAYER",
        BOT: "BOT",
        VEHICLE: "VEHICLE",
        STATUS: "STATUS",
        YOU: "YOU",
        READY_UP: "READY UP",
        UNREADY: "UNREADY",
        START_MATCH: "START MATCH"
    },
    PT: {
        DRIVER: "PILOTO",
        CREDITS: "CRÉDITOS",
        KILLS: "ABATES",
        OPERATION: "OPERAÇÃO",
        NETWORK: "REDE",
        MULTIPLAYER: "MULTIJOGADOR",
        DEPLOY: "IMPLANTAR",
        UNLOCK: "DESBLOQUEAR",
        TAP_CAR_TO_TUNE: "TOQUE NO CARRO PARA TUNAR",
        SETTINGS: "CONFIGURAÇÕES",
        LANGUAGE: "IDIOMA",
        PLAYER_ID: "ID DO JOGADOR",
        PLAYER_NAME: "NOME DO JOGADOR",
        CLOSE: "FECHAR",
        PUBLIC_ROOMS: "SALAS PÚBLICAS",
        REFRESH: "ATUALIZAR",
        JOIN: "ENTRAR",
        CREATE_ROOM: "CRIAR SALA",
        JOIN_PRIVATE: "ENTRAR PRIVADA",
        ROOM_NAME: "Nome da Sala",
        PRIVATE_ROOM: "Sala Privada",
        PASSWORD: "Senha",
        CREATE: "CRIAR",
        ROOM_ID: "ID da Sala",
        LEAVE_ROOM: "SAIR DA SALA",
        TOGGLE_READY: "PRONTO",
        START_GAME: "INICIAR JOGO",
        READY: "PRONTO",
        NOT_READY: "NÃO PRONTO",
        HOST: "ANFITRIÃO",
        WAITING: "AGUARDANDO",
        VICTORY: "VITÓRIA DA EQUIPE",
        DEFEAT: "MISSÃO ABORTADA",
        MISSION_REPORT: "RELATÓRIO DE MISSÃO",
        TOTAL_SCORE: "PONTUAÇÃO TOTAL",
        ELIMINATIONS: "ELIMINAÇÕES",
        ENERGY_COLLECTED: "ENERGIA COLETADA",
        PILOT: "PILOTO",
        SCORE: "PONTUAÇÃO",
        ENERGY: "ENERGIA",
        PLAY_AGAIN: "JOGAR NOVAMENTE",
        BACK_TO_MENU: "VOLTAR AO MENU",
        SHARE: "COMPARTILHAR",
        SYSTEM_PAUSED: "SISTEMA PAUSADO",
        RESUME_COMBAT: "RETOMAR COMBATE",
        CONFIGURE_HUD: "CONFIGURAR HUD",
        ABORT_MISSION: "ABORTAR MISSÃO",
        CONFIRM_ABORT: "Confirmar Aborto?",
        YES: "SIM",
        NO: "NÃO",
        ALIVE: "VIVOS",
        TOP_5: "TOP 5",
        PAUSE: "PAUSAR",
        LEADERBOARD: "CLASSIFICAÇÃO",
        SPECTATING: "Espectando",
        LIKE: "CURTIR",
        DISLIKE: "NÃO CURTIR",
        DRAG_TO_REPOSITION: "ARRASTE PARA REPOSICIONAR O HUD",
        MOVE: "MOVER",
        AIM: "MIRAR",
        BOOST: "IMPULSO",
        ABIL_1: "HABIL 1",
        ABIL_2: "HABIL 2",
        RESET: "REDEFINIR",
        SAVE_CLOSE: "SALVAR E FECHAR",
        NITRO: "NITRO",
        INITIALIZING: "INICIALIZANDO",
        CONNECTING: "CONECTANDO À ARENA GLOBAL...",
        ESTABLISHING_LINK: "ESTABELECENDO CONEXÃO...",
        OPTIMIZING: "OTIMIZANDO ATIVOS...",
        SYNCHRONIZING: "SINCRONIZANDO DADOS DA EQUIPE...",
        COMPILING: "COMPILANDO SHADERS...",
        CALIBRATING: "CALIBRANDO SENSORES...",
        LAUNCHING: "INICIANDO PROTOCOLO DE COMBATE...",
        TACTICAL_INTEL: "INTELIGÊNCIA TÁTICA",
        TIP_1: "Fazer drift enche sua barra de Nitro mais rápido.",
        TIP_2: "Colete orbes azuis para melhorar o poder da sua arma.",
        TIP_3: "Fique perto dos colegas de equipe para cobrir pontos cegos.",
        TIP_4: "Os escudos se regeneram após evitar danos por um tempo.",
        TIP_5: "Carros diferentes têm características de manuseio únicas.",
        INVITE_ALLY: "CONVIDAR ALIADO",
        PLAYER_ID_NAME: "ID / Nome do Jogador",
        ENTER_ID: "DIGITE O ID...",
        INVITE: "CONVIDAR",
        OR: "OU",
        ADD_AI_BOT: "ADICIONAR BOT IA",
        CANCEL: "CANCELAR",
        PLAYER: "JOGADOR",
        BOT: "BOT",
        VEHICLE: "VEÍCULO",
        STATUS: "STATUS",
        YOU: "VOCÊ",
        READY_UP: "PRONTO",
        UNREADY: "NÃO PRONTO",
        START_MATCH: "INICIAR PARTIDA"
    }
};

const DEFAULT_PROFILE: UserProfile = { 
    id: `ID-${Math.floor(Math.random()*10000).toString(16).toUpperCase()}`, 
    totalKills: 0, matchesPlayed: 0, favoriteCarIndex: 0, clanName: "", clanMembers: [], currency: 10000, 
    ownedCars: [0], ownedSkins: ['cyan', 'red', 'lime', 'purple', 'orange', 'pink', 'white', 'blue'],
    upgrades: {} 
};

export const NeonArena: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIdRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastBeepSecondRef = useRef<number>(-1);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<any[]>([]);
  
  // UI States
  const [language, setLanguage] = useState<'EN' | 'PT'>('PT');
  const t = TRANSLATIONS[language];
  const [showSettings, setShowSettings] = useState(false);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('SOLO');
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [tuningTab, setTuningTab] = useState<'UPGRADES' | 'SKINS'>('UPGRADES');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false); 
  const [killerName, setKillerName] = useState<string>("");
  const [matchResult, setMatchResult] = useState<'VICTORY' | 'DEFEAT' | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  // Unlock Animation State
  const [unlockingCarId, setUnlockingCarId] = useState<number | null>(null);
  const [unlockingSkinId, setUnlockingSkinId] = useState<string | null>(null);
  
  const [selectedCarType, setSelectedCarType] = useState(0); 
  const [selectedSkinIndex, setSelectedSkinIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0.85); 
  const [playerName, setPlayerName] = useState("DRIVER");
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [squadStatus, setSquadStatus] = useState<CarEntity[]>([]);

  // Team / Squad State
  interface Teammate { name: string; carIndex: number; skinIndex: number; isBot: boolean; id: string; }
  const [teammates, setTeammates] = useState<(Teammate | null)[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activeInviteSlot, setActiveInviteSlot] = useState<number | null>(null);
  const [inviteInput, setInviteInput] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("INITIALIZING");
  const [hasInteracted, setHasInteracted] = useState(false);

  // Multiplayer State
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const [createRoomData, setCreateRoomData] = useState({ name: "", isPrivate: false, password: "", maxPlayers: 10 });

  useEffect(() => {
    const handleInteraction = async () => {
      audioService.init();
      setHasInteracted(true);
    };
    
    const handleMenuClick = (e: MouseEvent | TouchEvent) => {
      if (hasInteracted && !isPlaying && !isLoading) {
        // Only play if not clicking a button (to avoid double sounds)
        const target = e.target as HTMLElement;
        if (target && !target.closest('button') && !target.closest('.pointer-events-auto')) {
          audioService.playUIClick();
        }
      }
    };

    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('mousedown', handleMenuClick);
    
    return () => {
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('mousedown', handleMenuClick);
    };
  }, [isPlaying, isLoading, hasInteracted]);

  useEffect(() => {
      let size = 0;
      if (selectedGameMode === 'DUO') size = 1;
      else if (selectedGameMode === 'TRIO') size = 2;
      else if (selectedGameMode === 'SQUAD') size = 3;
      
      setTeammates(prev => {
          const newArr = new Array(size).fill(null);
          // Preserve existing if possible?
          for(let i=0; i<Math.min(prev.length, size); i++) {
              newArr[i] = prev[i];
          }
          return newArr;
      });
  }, [selectedGameMode]);

  const [activeTab, setActiveTab] = useState<MenuTab>('GARAGE');
  const [clanInput, setClanInput] = useState("");
  const [memberInput, setMemberInput] = useState("");

  // Menu View State for React UI
  const [menuView, setMenuView] = useState<'OVERVIEW' | 'DETAIL'>('OVERVIEW');

  // --- SAFE PROFILE LOADING ---
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
      if (typeof window === 'undefined') return { ...DEFAULT_PROFILE, currency: 999999999 };
      try {
          const saved = localStorage.getItem('NEON_DRIFT_PROFILE_V3');
          if (saved) {
              const parsed = JSON.parse(saved);
              // Basic validation to prevent crash on stale data
              if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ownedCars)) {
                  if (parsed.favoriteCarIndex >= CAR_TYPES.length) parsed.favoriteCarIndex = 0;
                  return { ...DEFAULT_PROFILE, ...parsed, currency: 999999999 }; // Merge default for missing fields
              }
          }
      } catch (e) {
          console.error("Profile load failed, resetting", e);
      }
      return { ...DEFAULT_PROFILE, currency: 999999999 };
  });

  useEffect(() => {
      if(typeof window !== 'undefined') { localStorage.setItem('NEON_DRIFT_PROFILE_V3', JSON.stringify(userProfile)); }
  }, [userProfile]);

  const [leaderboardData, setLeaderboardData] = useState<CarEntity[]>([]);

  const getDefaultLayout = (): HUDLayout => {
      if (typeof window === 'undefined') return { driveStick: {x:0,y:0}, fireStick: {x:0,y:0}, boostBtn: {x:0,y:0}, ability1Btn: {x:0,y:0}, ability2Btn: {x:0,y:0}, zoomSlider: {x:0,y:0}, powerStackBtn: {x:0,y:0} };
      const w = window.innerWidth; const h = window.innerHeight;
      const isMobile = w < 768; const marginX = isMobile ? 30 : 40; const marginY = isMobile ? 30 : 40; const stickSize = 144;
      return {
          driveStick: { x: marginX, y: h - marginY - stickSize }, 
          fireStick: { x: w - marginX - stickSize, y: h - marginY - stickSize }, 
          boostBtn: { x: w - marginX - stickSize - 30, y: h - marginY - stickSize - 80 }, 
          ability1Btn: { x: w - marginX - stickSize - 100, y: h - marginY - stickSize - 20 }, 
          ability2Btn: { x: w - marginX - stickSize - 140, y: h - marginY - stickSize + 60 }, 
          zoomSlider: { x: w - 50, y: h / 2 - 80 },
          powerStackBtn: { x: w - marginX - stickSize - 30, y: h - marginY - stickSize - 160 }
      };
  };

  const [layout, setLayout] = useState<HUDLayout>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('NEON_DRIFT_HUD_V2');
          if (saved) { try { const parsed = JSON.parse(saved); if(parsed.driveStick) return parsed; } catch (e) {} }
      }
      return getDefaultLayout();
  });
  
  const [dragTarget, setDragTarget] = useState<keyof HUDLayout | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const state = useRef<GameState>({
    matchState: 'COUNTDOWN', matchTimer: 10,
    player: createCar('player', 0, 0, 0), bots: [], bullets: [], particles: [], groundDecals: [], orbs: [], stations: [], deadSpots: [], speedLines: [], killLog: [], announcement: null, damageTexts: [],
    camera: { x: 0, y: 0, zoom: 0.85, shakeX: 0, shakeY: 0, shakeTrauma: 0, offsetX: 0, offsetY: 0, offsetTargetX: 0, offsetTargetY: 0, spectateTargetId: null },
    input: { moveX: 0, moveY: 0, aimX: 0, aimY: 0, isShooting: false, isBoosting: false, isAbility1Pressed: false, isAbility2Pressed: false, aimSource: 'joystick' },
    menu: { scrollX: 0, targetScrollX: 0, isDragging: false, lastDragX: 0, rotation: 0, viewState: 'OVERVIEW', cameraZoom: 1.0, cameraYOffset: 0, transitionProgress: 0 },
    isPaused: false, isGameOver: false, isSpectating: false, showMapOverlay: false, hudLayout: layout, zoomInteracting: false, currentArenaRadius: BASE_ARENA_RADIUS,
    lastPinchDist: 0,
    powerSpawnTimer: 0,
    powerStackInteraction: { isDragging: false, startX: 0, startY: 0, dragX: 0, dragY: 0, activeIndex: 0 },
    gameMode: 'SOLO'
  });

  const [fps, setFps] = useState(0);

  function createCar(id: string, typeIdx: number, skinIdx: number, teamId: number, x = 0, y = 0, name?: string, upgrades?: CarUpgradeState): CarEntity {
    // Safety Checks
    const safeTypeIdx = (typeIdx >= 0 && typeIdx < CAR_TYPES.length) ? typeIdx : 0;
    const safeSkinIdx = (skinIdx >= 0 && skinIdx < SKINS.length) ? skinIdx : 0;
    
    const stats = CAR_TYPES[safeTypeIdx];
    const upg = upgrades || { speed: 0, health: 0, damage: 0, fireRate: 0, nitroSpeed: 0, ammo: 0, radarRange: 0 };
    
    // Calculate Upgraded Stats
    let maxHealth = stats.baseHealth * (1 + upg.health * 0.1); 
    const statSpeed = stats.baseSpeed * (1 + upg.speed * 0.1); 
    let statDamage = stats.baseDamage * (1 + upg.damage * 0.1); 
    
    // Reduce bot stats (they shouldn't be too strong)
    if (id !== 'player' && !id.startsWith('menu_')) {
        statDamage *= 0.15; // Reduced from 0.35 to 0.15 for weaker bots
        maxHealth *= 0.5;   // Reduced from 0.7 to 0.5 for weaker bots
    }

    const statFireRate = Math.max(1, stats.baseFireRate * (1 - upg.fireRate * 0.06)); 
    const statNitroSpeed = statSpeed * (1.5 + upg.nitroSpeed * 0.1); 
    const maxAmmo = 50 + (upg.ammo || 0) * 10;
    const radarRange = 1500 + (upg.radarRange || 0) * 200;

    return {
      id, name, teamId, typeIndex: safeTypeIdx, skinIndex: safeSkinIdx, 
      x, y, z: 0, vx: 0, vy: 0, vz: 0, angle: Math.random() * Math.PI * 2, steering: 0, turretAngle: 0,
      lastShot: 0, health: maxHealth, maxHealth: maxHealth, lives: MAX_LIVES, isDead: true, respawnTimer: 0, spawnAnim: 0, score: START_SCORE,
      totalKills: 0, killStreak: 0, lastKillTime: 0, ammo: maxAmmo, maxAmmo: maxAmmo, reloadTimer: 0, muzzleFlashTimer: 0, hitMarkerTimer: 0, damageFlash: 0, isBoosting: false, boostFuel: MAX_BOOST,
      isDrifting: false, driftTimer: 0, lastHealTime: 0, isDocked: false, dockTimer: 0,
      ability1Charges: 3, ability1Cooldown: 0, ability1ActiveTimer: 0, ability2Charges: 3, ability2Cooldown: 0, ability2ActiveTimer: 0,
      isJumping: false, isStealth: false,
      tongueState: 'idle', tongueTargetId: null, tongueLength: 0, tongueMaxLen: 500, tongueAngle: 0,
      visualTrails: [[], [], [], []], aiState: 'wander', aiChangeTimer: 0, aiReactionTimer: 0, tickOffset: Math.floor(Math.random() * 60),
      statSpeed, statDamage, statFireRate, statNitroSpeed, baseRegen: stats.baseRegen || 0.03, radarRange,
      activePower: 'NONE', powerTimer: 0, powerInventory: [],
      wheelAngle: 0,
      energySwirlTimer: 0,
      chargeLevel: 0,
      tagPos: { x, y: y - 80, vx: 0, vy: 0 },
      visualHealth: maxHealth,
      likes: 0,
      dislikes: 0,
      killerId: null
    };
  }

  // Sync React State
  useEffect(() => { 
    if (!isPlaying) {
        const upg = userProfile.upgrades[selectedCarType];
        state.current.player = createCar('player', selectedCarType, selectedSkinIndex, 0, 0, 0, playerName || "DRIVER", upg);
        state.current.player.isDead = false;
        state.current.menu.targetScrollX = selectedCarType;
    }
  }, [selectedCarType, selectedSkinIndex, isPlaying, userProfile.upgrades]);

  useEffect(() => { 
      state.current.camera.zoom = zoomLevel; 
      audioService.setCameraZoom(zoomLevel);
  }, [zoomLevel]);
  useEffect(() => { state.current.isPaused = isPaused; }, [isPaused]);
  useEffect(() => { state.current.hudLayout = layout; }, [layout]);

  // Sync Menu View State
  useEffect(() => {
      state.current.menu.viewState = menuView;
  }, [menuView]);

  const startGame = (mode: GameMode) => {
    if (isLoading) return; // Prevent double click
    
    if (mode === 'MULTIPLAYER') {
        setShowModeSelect(false);
        setShowMultiplayerLobby(true);
        multiplayerService.init();
        multiplayerService.getRooms((r) => setRooms(r));
        return;
    }

    // GLOBAL MATCHMAKING for Normal Modes
    setIsLoading(true);
    setLoadingText("CONNECTING TO GLOBAL ARENA...");
    multiplayerService.init();
    
    const tryJoinGlobal = () => {
        multiplayerService.joinRoom({
            roomId: 'GLOBAL_ARENA',
            playerName: playerName || "DRIVER",
            carType: selectedCarType,
            skinIndex: selectedSkinIndex
        }, (res) => {
            if (res.success) {
                startActualGame(mode, res.room);
            } else {
                // Create global room if it doesn't exist
                multiplayerService.createRoom({
                    roomId: 'GLOBAL_ARENA',
                    name: "GLOBAL ARENA",
                    playerName: playerName || "DRIVER",
                    carType: selectedCarType,
                    skinIndex: selectedSkinIndex,
                    isPrivate: false,
                    maxPlayers: 20
                }, (createRes) => {
                    if (createRes.success) {
                        // Force ID to GLOBAL_ARENA on server if possible? 
                        // Actually the server generates a random ID. 
                        // I should probably modify the server to support a fixed ID for global.
                        startActualGame(mode, createRes.room);
                    } else {
                        // Fallback to local if server fails
                        startActualGame(mode);
                    }
                });
            }
        });
    };

    // Wait a bit for connection
    setTimeout(tryJoinGlobal, 1000);
  };

  useEffect(() => {
    const handleRoomsList = (r: any) => setRooms(r);
    const handleRoomUpdated = (r: any) => {
        setCurrentRoom(r);
        // Sync other players as "bots" in the game state
        if (isPlaying && r.players) {
            r.players.forEach((p: any) => {
                if (p.id !== multiplayerService.socketId && !state.current.bots.find(b => b.id === p.id)) {
                    const newBot = createCar(p.id, p.carType, p.skinIndex, p.teamId, Math.random() * 1000, Math.random() * 1000, p.name);
                    newBot.isDead = false;
                    state.current.bots.push(newBot);
                }
            });
            // Remove players who left
            state.current.bots = state.current.bots.filter(b => 
                !b.id.startsWith('player_') || r.players.find((p: any) => p.id === b.id)
            );
        }
    };
    const handleGameStarted = (r: any) => {
        setShowMultiplayerLobby(false);
        startActualGame('MULTIPLAYER', r);
    };
    const handlePlayerMoved = (data: any) => {
        const bot = state.current.bots.find(b => b.id === data.id);
        if (bot) {
            bot.x = data.x;
            bot.y = data.y;
            bot.angle = data.angle;
            bot.vx = data.vx;
            bot.vy = data.vy;
            bot.isDead = data.isDead;
            bot.health = data.health;
            bot.isBoosting = data.isBoosting;
            bot.isDrifting = data.isDrifting;
            bot.turretAngle = data.turretAngle;
        }
    };
    const handlePlayerShot = (data: any) => {
        const bot = state.current.bots.find(b => b.id === data.ownerId);
        if (bot) {
            bot.lastShot = Date.now();
            bot.muzzleFlashTimer = 10;
            const b = {
                id: `bullet_${data.ownerId}_${Date.now()}_${Math.random()}`,
                x: data.x, y: data.y, vx: data.vx, vy: data.vy,
                ownerId: data.ownerId, ownerTeamId: bot.teamId, ownerName: bot.name || 'UNKNOWN',
                damage: data.damage, life: data.life || 60, bType: data.bType || 'STANDARD',
                color: data.color, size: data.size || 2, bounces: data.bounces || false, bounceCount: 0,
                projectileCoreColor: data.projectileCoreColor
            };
            state.current.bullets.push(b as any);
            audioService.playShootSound(getCarStats(bot.typeIndex), false, data.x, data.y, state.current.player.x, state.current.player.y, data.chargeMultiplier || 1);
        }
    };

    multiplayerService.on("roomsList", handleRoomsList);
    multiplayerService.on("roomUpdated", handleRoomUpdated);
    multiplayerService.on("gameStarted", handleGameStarted);
    multiplayerService.on("playerMoved", handlePlayerMoved);
    multiplayerService.on("playerShot", handlePlayerShot);

    return () => {
        multiplayerService.off("roomsList", handleRoomsList);
        multiplayerService.off("roomUpdated", handleRoomUpdated);
        multiplayerService.off("gameStarted", handleGameStarted);
        multiplayerService.off("playerMoved", handlePlayerMoved);
        multiplayerService.off("playerShot", handlePlayerShot);
    };
  }, []);

  const startActualGame = (mode: GameMode, roomData?: any) => {
    audioService.init();
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingText(t.ESTABLISHING_LINK);

    // Simulate Loading & Optimization Sequence
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 2; // Slower progress for cinematic feel
        if (progress > 100) progress = 100;
        
        setLoadingProgress(progress);

        if (progress < 20) setLoadingText(t.OPTIMIZING);
        else if (progress < 40) setLoadingText(t.SYNCHRONIZING);
        else if (progress < 60) setLoadingText(t.COMPILING);
        else if (progress < 80) setLoadingText(t.CALIBRATING);
        else setLoadingText(t.LAUNCHING);

                if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                audioService.stopAllSounds();
                setIsLoading(false);
                // Actual Start Logic
                setIsPlaying(true); setIsPaused(false); setIsGameOver(false);
                state.current.gameMode = mode;
                let radius = BASE_ARENA_RADIUS; let teamSize = 1; let enemyTeamCount = 9;
                if (mode === 'DUO') { radius = 40000; teamSize = 2; enemyTeamCount = 9; }
                if (mode === 'TRIO') { radius = 50000; teamSize = 3; enemyTeamCount = 9; }
                if (mode === 'SQUAD') { radius = 70000; teamSize = 4; enemyTeamCount = 9; } 
                
                if (roomData && roomData.id === 'GLOBAL_ARENA') {
                    enemyTeamCount = 3; // Fewer bots in global mode to leave room for players
                }
                state.current.matchState = 'COUNTDOWN'; state.current.matchTimer = 10; state.current.currentArenaRadius = radius;
                state.current.isGameOver = false; state.current.isSpectating = false; state.current.camera.spectateTargetId = null; state.current.showMapOverlay = false;
                
                // Enforce skin ownership
                let finalSkinIndex = selectedSkinIndex;
                if (!userProfile.ownedSkins.includes(getSkin(selectedSkinIndex).id)) {
                    finalSkinIndex = 0; // Fallback to default
                }

                // Player Spawn
                const upg = userProfile.upgrades[selectedCarType];
                state.current.player = createCar('player', selectedCarType, finalSkinIndex, 0, 0, 0, playerName || "DRIVER", upg);
                state.current.player.isDead = false; state.current.player.spawnAnim = 0; state.current.killLog = []; state.current.announcement = null; state.current.player.score = 0;
                
                setUserProfile(prev => ({...prev, matchesPlayed: prev.matchesPlayed + 1, favoriteCarIndex: selectedCarType}));
                state.current.bullets = []; state.current.particles = []; state.current.groundDecals = []; state.current.deadSpots = []; state.current.orbs = []; state.current.bots = []; state.current.stations = []; state.current.speedLines = []; state.current.damageTexts = [];
            
                if (roomData && roomData.players) {
                    roomData.players.forEach((p: any) => {
                        if (p.id !== multiplayerService.socketId) {
                            const bot = createCar(p.id, p.carType, p.skinIndex, p.teamId, 0, 0, p.name);
                            bot.isDead = false;
                            state.current.bots.push(bot);
                        }
                    });
                }

                if (mode === 'MULTIPLAYER' || (roomData && roomData.id === 'GLOBAL_ARENA')) {
                    // Multiplayer init is handled in lobby or global start
                    state.current.gameMode = 'MULTIPLAYER'; // Treat global as multiplayer
                }
            
                const playerSpawnAngle = Math.random() * Math.PI * 2; const playerSpawnDist = radius * 0.8; 
                const px = Math.cos(playerSpawnAngle) * playerSpawnDist; const py = Math.sin(playerSpawnAngle) * playerSpawnDist;
                state.current.player.x = px; state.current.player.y = py; state.current.player.angle = playerSpawnAngle + Math.PI;
            
                // Helper for random bot upgrades
                const getRandomBotUpgrades = () => {
                    const lvl = Math.floor(Math.random() * 3); 
                    return { speed: lvl, health: lvl, damage: lvl, fireRate: lvl, nitroSpeed: lvl, ammo: lvl, radarRange: lvl };
                };
            
                if (mode === 'MULTIPLAYER' && roomData) {
                    // Spawn real players instead of bots
                    state.current.bots = [];
                    roomData.players.forEach((p: any) => {
                        if (p.id !== multiplayerService.socketId) {
                            const bot = createCar(p.id, p.carType, p.skinIndex, p.teamId, px + Math.random()*200, py + Math.random()*200, p.name);
                            bot.isDead = false; bot.angle = state.current.player.angle;
                            state.current.bots.push(bot);
                        } else {
                            state.current.player.teamId = p.teamId;
                        }
                    });
                } else {
                    if (teamSize > 1) {
                        for (let i = 0; i < teamSize - 1; i++) {
                            // Check if we have a configured teammate for this slot
                            const configuredTm = teammates[i];
                            
                            let bType, bSkin, bName;
                            
                            if (configuredTm) {
                                bType = configuredTm.carIndex;
                                bSkin = configuredTm.skinIndex;
                                bName = configuredTm.name;
                            } else {
                                // Random bot if slot is empty
                                bType = Math.floor(Math.random() * CAR_TYPES.length); 
                                bSkin = Math.floor(Math.random() * SKINS.length); 
                                bName = userProfile.clanMembers[i] || `ALLY_${i+1}`; 
                            }
                
                            const offsetX = (i + 1) * 80; const offsetY = (i % 2 === 0 ? 1 : -1) * 80; const cos = Math.cos(state.current.player.angle); const sin = Math.sin(state.current.player.angle); const rx = offsetX * sin + offsetY * cos; const ry = offsetX * -cos + offsetY * sin;
                            const bot = createCar(`teammate_${i}`, bType, bSkin, 0, px + rx, py + ry, bName, getRandomBotUpgrades()); bot.isDead = false; bot.angle = state.current.player.angle; state.current.bots.push(bot);
                        }
                    }
                    for (let t = 1; t <= enemyTeamCount; t++) {
                        const teamAngle = (Math.PI * 2 * (t / (enemyTeamCount + 1))) + (Math.random() * 0.2); const teamDist = radius * 0.8; const tx = Math.cos(teamAngle) * teamDist; const ty = Math.sin(teamAngle) * teamDist; const facing = teamAngle + Math.PI;
                        for (let m = 0; m < teamSize; m++) {
                            const bType = Math.floor(Math.random() * CAR_TYPES.length); const bSkin = Math.floor(Math.random() * SKINS.length); const bName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                            const offsetX = (m + 1) * 80; const offsetY = (m % 2 === 0 ? 1 : -1) * 80; const cos = Math.cos(facing); const sin = Math.sin(facing); const rx = offsetX * sin + offsetY * cos; const ry = offsetX * -cos + offsetY * sin;
                            const bot = createCar(`enemy_${t}_${m}`, bType, bSkin, t, tx + rx, ty + ry, bName, getRandomBotUpgrades()); bot.isDead = false; bot.angle = facing; state.current.bots.push(bot);
                        }
                    }
                }
                setShowModeSelect(false);
                
                // Spawn Map Orbs
                for(let i=0; i<MAP_ORB_COUNT * (teamSize * 0.8); i++) { 
                    const ang = Math.random() * Math.PI * 2; const dist = Math.random() * (radius - 100);
                    state.current.orbs.push({ id: `map_orb_${i}`, x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, value: 1, color: '#ffffff', vx: 0, vy: 0, animOffset: Math.random() * 100, life: 999999, isMapOrb: true, powerType: 'NONE' });
                }
                
                // Spawn Healing Stations
                const stationCount = Math.max(3, Math.floor(HEALING_STATION_COUNT * (radius / BASE_ARENA_RADIUS)));
                for(let i=0; i<stationCount; i++) {
                    const ang = (i / stationCount) * Math.PI * 2 + (Math.random() * 0.5); const dist = radius * (0.3 + (i % 3) * 0.25); 
                    state.current.stations.push({ id: `station_${i}`, x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, color: STATION_COLORS[i % STATION_COLORS.length], animOffset: Math.random() * 1000, active: true, cooldownTimer: 0, occupantId: null });
                }

            }, 500);
        }
    }, 50); // Fast updates
  };

  const buyCar = (carIndex: number) => {
      const cost = getCarStats(carIndex).price;
      if (userProfile.currency >= cost) { 
          setUserProfile(prev => ({ ...prev, currency: prev.currency - cost }));
          setUnlockingCarId(carIndex);
          setTimeout(() => {
              setUserProfile(prev => ({ ...prev, ownedCars: [...prev.ownedCars, carIndex] }));
              setUnlockingCarId(null);
          }, 1500);
      }
  };

  const buySkin = (skinIndex: number) => {
      const skinId = getSkin(skinIndex).id;
      const cost = getSkin(skinIndex).price;
      if (userProfile.currency >= cost && !userProfile.ownedSkins.includes(skinId)) {
          setUserProfile(prev => ({ ...prev, currency: prev.currency - cost }));
          setUnlockingSkinId(skinId);
          setTimeout(() => {
              setUserProfile(prev => ({ ...prev, ownedSkins: [...prev.ownedSkins, skinId] }));
              setUnlockingSkinId(null);
          }, 1000);
      }
  };

  const upgradeCar = (stat: keyof CarUpgradeState, change: number) => {
      setUserProfile(prev => {
          const currentUpgrades = prev.upgrades[selectedCarType] || { speed: 0, health: 0, damage: 0, fireRate: 0, nitroSpeed: 0, ammo: 0, radarRange: 0 };
          const currentLevel = currentUpgrades[stat];
          const nextLevel = currentLevel + change;
          if (nextLevel < 0) return prev; 
          const cost = 500 * (currentLevel + (change > 0 ? 1 : 0)); 
          if (change > 0) {
              if (prev.currency >= cost) {
                  return {
                      ...prev, currency: prev.currency - cost,
                      upgrades: { ...prev.upgrades, [selectedCarType]: { ...currentUpgrades, [stat]: nextLevel } }
                  };
              }
          } else {
              const refund = Math.floor((500 * currentLevel) * 0.5);
              return {
                  ...prev, currency: prev.currency + refund,
                  upgrades: { ...prev.upgrades, [selectedCarType]: { ...currentUpgrades, [stat]: nextLevel } }
              };
          }
          return prev;
      });
  };

  const returnToMenu = () => { 
    audioService.stopAllSounds(); 
    setIsPaused(false); 
    setIsCustomizing(false); 
    setIsGameOver(false); 
    setIsPlaying(false); 
    setIsSpectating(false); 
    setShowExitConfirm(false); 
    setMenuView('OVERVIEW'); 
    state.current.camera.x = 0; 
    state.current.camera.y = 0; 
    state.current.bots = []; 
    state.current.bullets = []; 
    state.current.orbs = []; 
    state.current.player.x = 0; 
    state.current.player.y = 0; 
    setHasSelectedMode(true); 
    setShowModeSelect(true); 
  };
  const triggerSelfDestruct = () => { const p = state.current.player; if (p.isDead) return; p.lives = 0; p.health = 0; killEntity(p, state.current, undefined, "SELF_DESTRUCT"); };
  
  const handleConfirmExit = () => { triggerSelfDestruct(); setTimeout(() => { returnToMenu(); }, 1000); };
  const handleLike = () => {
      const targetId = state.current.camera.spectateTargetId;
      if (!targetId) return;
      const target = [state.current.player, ...state.current.bots].find(c => c.id === targetId);
      if (target) {
          target.likes++;
          state.current.announcement = { text: "LIKED!", subText: `PLAYER: ${target.name}`, life: 60, scale: 1.2, color: '#00ff00' };
          // Spawn floating emoji
          for (let i = 0; i < 5; i++) {
              state.current.particles.push({
                  x: target.x + (Math.random() - 0.5) * 40,
                  y: target.y + (Math.random() - 0.5) * 40,
                  vx: (Math.random() - 0.5) * 4,
                  vy: -4 - Math.random() * 4,
                  life: 60 + Math.random() * 30,
                  maxLife: 90,
                  color: '#00ff00',
                  size: 20,
                  type: 'emoji',
                  char: '👍'
              });
          }
      }
  };
  const handleDislike = () => {
      const targetId = state.current.camera.spectateTargetId;
      if (!targetId) return;
      const target = [state.current.player, ...state.current.bots].find(c => c.id === targetId);
      if (target) {
          target.dislikes++;
          state.current.announcement = { text: "DISLIKED!", subText: `PLAYER: ${target.name}`, life: 60, scale: 1.2, color: '#ff0000' };
          // Spawn floating emoji
          for (let i = 0; i < 5; i++) {
              state.current.particles.push({
                  x: target.x + (Math.random() - 0.5) * 40,
                  y: target.y + (Math.random() - 0.5) * 40,
                  vx: (Math.random() - 0.5) * 4,
                  vy: -4 - Math.random() * 4,
                  life: 60 + Math.random() * 30,
                  maxLife: 90,
                  color: '#ff0000',
                  size: 20,
                  type: 'emoji',
                  char: '👎'
              });
          }
      }
  };
  const startSpectatingKiller = () => { let targetId = state.current.camera.spectateTargetId; if (!targetId || targetId === 'SELF_DESTRUCT') { const all = [...state.current.bots].filter(b => !b.isDead); if(all.length > 0) targetId = all[0].id; } state.current.camera.spectateTargetId = targetId; state.current.isSpectating = true; setIsSpectating(true); setIsGameOver(false); };
  const triggerShake = (amount: number) => { state.current.camera.shakeTrauma = Math.min(state.current.camera.shakeTrauma + amount, 1.0); };
  const handleMoveJoystick = useCallback((x: number, y: number) => { state.current.input.moveX = x; state.current.input.moveY = y; }, []);
  const handleAimJoystick = useCallback((x: number, y: number) => { state.current.input.aimX = x; state.current.input.aimY = y; state.current.input.aimSource = 'joystick'; state.current.input.isShooting = Math.sqrt(x*x + y*y) > 0.1; }, []);
  const toggleBoost = (active: boolean) => { state.current.input.isBoosting = active; };

  const triggerAbility = (slot: 1 | 2) => {
      const p = state.current.player; const stats = getCarStats(p.typeIndex); const abilityType = slot === 1 ? stats.ability : stats.secondaryAbility;
      if (!abilityType) return;
      const charges = slot === 1 ? p.ability1Charges : p.ability2Charges; const cooldown = slot === 1 ? p.ability1Cooldown : p.ability2Cooldown;
      if (charges > 0 && cooldown <= 0) {
          let activated = false;
          if (abilityType === 'jump' && !p.isJumping) { p.isJumping = true; p.vz = 18; p.z = 1; activated = true; state.current.particles.push({x: p.x, y: p.y, vx: 0, vy: 0, life: 30, maxLife: 30, color: '#fff', size: 50, type: 'shockwave'}); }
          else if (abilityType === 'tongue' && p.tongueState === 'idle') { p.tongueState = 'out'; p.tongueLength = 0; p.tongueAngle = p.turretAngle; p.tongueTargetId = null; activated = true; }
          else if (abilityType === 'stealth' && !p.isStealth) { p.isStealth = true; p.ability1ActiveTimer = 300; activated = true; spawnParticles(state.current, p.x, p.y, 20, '#ff0000', 2, 'spark'); triggerShake(0.2); }
          else if (abilityType === 'fire_breath' && p.ability2ActiveTimer <= 0) { p.ability2ActiveTimer = 240; activated = true; }
          
          if (activated) { if (slot === 1) { p.ability1Charges--; } else { p.ability2Charges--; } }
      }
  };

  const triggerEnergyPickup = (s: GameState, car: CarEntity, color: string) => {
      // Cinematic Effect: Set the swirl timer
      car.energySwirlTimer = 40; 
      
      // Camera shake for player
      if (car.id === 'player') triggerShake(0.2);
      
      // Spawn Orbiting / Swirling Particles
      for(let k=0; k<15; k++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 30 + Math.random() * 20;
          // Initial velocity slightly outwards + inherent motion
          s.particles.push({
              x: car.x, y: car.y,
              vx: Math.cos(ang) * 5 + car.vx * 0.2,
              vy: Math.sin(ang) * 5 + car.vy * 0.2,
              life: 40, maxLife: 40,
              color: color,
              size: 3 + Math.random() * 3,
              type: 'energy_swirl', 
              orbitAngle: ang, 
              orbitDist: dist
          });
      }
  };

  // --- Helper to get mode button coordinates ---
  const getModeButtons = (width: number, height: number) => {
    const isMobile = width < 768;
    const buttonW = isMobile ? width * 0.4 : 220;
    const buttonH = isMobile ? 120 : 350;
    const gap = 20;
    const startY = isMobile ? height / 2 - buttonH - gap : height / 2 - buttonH / 2;
    
    // Centered layout logic
    const totalW = isMobile ? buttonW * 2 + gap : buttonW * 4 + gap * 3;
    const startX = width / 2 - totalW / 2;

    const modes: { mode: GameMode; x: number; y: number; w: number; h: number; color: string; label: string }[] = [
        { mode: 'SOLO', x: 0, y: 0, w: buttonW, h: buttonH, color: '#00ffff', label: 'SOLO OPS' },
        { mode: 'DUO', x: 0, y: 0, w: buttonW, h: buttonH, color: '#00ff44', label: 'DUO SYNC' },
        { mode: 'TRIO', x: 0, y: 0, w: buttonW, h: buttonH, color: '#ffaa00', label: 'TRIAD' },
        { mode: 'SQUAD', x: 0, y: 0, w: buttonW, h: buttonH, color: '#ff00ff', label: 'SQUADRON' },
    ];

    modes.forEach((m, i) => {
        if (isMobile) {
            // 2x2 Grid
            const row = Math.floor(i / 2);
            const col = i % 2;
            m.x = startX + col * (buttonW + gap);
            m.y = startY + row * (buttonH + gap);
        } else {
            // Horizontal row
            m.x = startX + i * (buttonW + gap);
            m.y = startY;
        }
    });

    return modes;
  };


  const handleMenuDragStart = (e: React.MouseEvent | React.TouchEvent) => { if(isPlaying) return; if (activeTab !== 'GARAGE') return; const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; if (isPlaying && !state.current.isPaused) { } else { state.current.menu.isDragging = true; state.current.menu.lastDragX = x; } };
  const handleMenuDragMove = (e: React.MouseEvent | React.TouchEvent) => {
      // PINCH TO ZOOM UPDATE
      if ('touches' in e && e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          
          if (state.current.lastPinchDist > 0) {
              const delta = dist - state.current.lastPinchDist;
              // Sensitivity
              const zoomChange = delta * 0.005;
              const newZoom = Math.max(0.4, Math.min(1.5, state.current.camera.zoom + zoomChange));
              setZoomLevel(newZoom);
          }
          state.current.lastPinchDist = dist;
          return;
      } else {
          state.current.lastPinchDist = 0; // Reset if fingers lifted
      }

      const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const y = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      if(isPlaying) { 
          if(state.current.zoomInteracting) { const sliderY = state.current.hudLayout.zoomSlider.y; const sliderH = 160; const relY = Math.max(0, Math.min(1, (y - sliderY) / sliderH)); const newZoom = 0.4 + (1 - relY) * 1.1; setZoomLevel(Math.max(0.4, Math.min(1.5, newZoom))); } 
          if(state.current.powerStackInteraction.isDragging) {
              state.current.powerStackInteraction.dragX = x;
              state.current.powerStackInteraction.dragY = y;
          }
          return; 
      }
      if (activeTab === 'GARAGE' && !isPlaying) {
          if (state.current.menu.isDragging) {
              const dx = x - state.current.menu.lastDragX;
              state.current.menu.rotation += dx * 0.01;
              state.current.menu.lastDragX = x;
          }
      }
  };
  const handleMenuDragEnd = () => { 
      state.current.zoomInteracting = false; 
      state.current.menu.isDragging = false; 
      
      // Handle Power Stack Release
      if (state.current.powerStackInteraction.isDragging) {
          const s = state.current;
          const p = s.player;
          const dx = s.powerStackInteraction.dragX - s.powerStackInteraction.startX;
          const dy = s.powerStackInteraction.dragY - s.powerStackInteraction.startY;
          const dragDist = Math.hypot(dx, dy);
          
          if (dragDist < 20) {
              // Tap: Use current power (index 0)
              if (p.powerInventory.length > 0) {
                  const powerToUse = p.powerInventory[0];
                  p.powerInventory.shift(); // Remove used
                  applyPowerUp(p, powerToUse, s);
              }
          } else {
              // Drag: Check selection
              // If dragged right, we expanded the list.
              // Calculate which item was selected based on drag X
              if (dx > 0 && p.powerInventory.length > 1) {
                  const itemWidth = 60;
                  const index = Math.floor((dx - 20) / itemWidth);
                  if (index >= 0 && index < p.powerInventory.length) {
                      // Move selected to front (index 0)
                      const selected = p.powerInventory.splice(index, 1)[0];
                      p.powerInventory.unshift(selected);
                  }
              }
          }
          s.powerStackInteraction.isDragging = false;
      }
  };
  const handleCanvasTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const y = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      // PINCH TO ZOOM LOGIC
      if ('touches' in e && e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          state.current.lastPinchDist = dist;
          return; // Don't process other clicks if pinching
      }
      
      // Mode Selection Click Handling
      if (!isPlaying && showModeSelect) {
          const buttons = getModeButtons(window.innerWidth, window.innerHeight);
          for (const btn of buttons) {
              if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                  setSelectedGameMode(btn.mode);
                  setShowModeSelect(false);
                  setHasSelectedMode(true);
                  return;
              }
          }
          return;
      }

      // Menu Interaction: Click on Car to Zoom or Change Car
      if (!isPlaying && activeTab === 'GARAGE') {
          
          if (menuView === 'OVERVIEW') {
              const cx = window.innerWidth / 2;
              const cy = window.innerHeight / 2;
              
              // Check Left Arrow Click (Near Left Edge)
              if (x < 160 && Math.abs(y - cy) < 100) {
                  setSelectedCarType(prev => (prev - 1 + CAR_TYPES.length) % CAR_TYPES.length);
                  return;
              }

              // Check Right Arrow Click (Near Right Edge)
              if (x > window.innerWidth - 160 && Math.abs(y - cy) < 100) {
                  setSelectedCarType(prev => (prev + 1) % CAR_TYPES.length);
                  return;
              }

              // Check Center Click (Zoom)
              const dx = x - cx;
              const dy = y - cy;
              if (Math.hypot(dx, dy) < 200) {
                  setMenuView('DETAIL');
                  return;
              }
          }
          
          handleMenuDragStart(e);
          return;
      }
      
      if(!isPlaying || isCustomizing) return;
      
      let touchedRadar = false;
      if ('touches' in e) { for(let i = 0; i < e.touches.length; i++) { const tx = e.touches[i].clientX; const ty = e.touches[i].clientY; if (Math.hypot(tx - 90, ty - 130) < 80) touchedRadar = true; } } else { if (Math.hypot(x - 90, y - 130) < 80) touchedRadar = true; }
      if (touchedRadar) { state.current.showMapOverlay = !state.current.showMapOverlay; return; }
      if (state.current.showMapOverlay && !touchedRadar) { state.current.showMapOverlay = false; return; }
      const zx = state.current.hudLayout.zoomSlider.x; const zy = state.current.hudLayout.zoomSlider.y;
      if (x > zx - 20 && x < zx + 50 && y > zy - 20 && y < zy + 180) { state.current.zoomInteracting = true; }
      
      // Power Stack Interaction
      const ps = state.current.hudLayout.powerStackBtn;
      if (Math.hypot(x - (ps.x + 30), y - (ps.y + 30)) < 40) {
          state.current.powerStackInteraction.isDragging = true;
          state.current.powerStackInteraction.startX = x;
          state.current.powerStackInteraction.startY = y;
          state.current.powerStackInteraction.dragX = x;
          state.current.powerStackInteraction.dragY = y;
      }

      // Exit Button Touch Detection
      const exitBtnX = window.innerWidth - 60;
      const exitBtnY = 60;
      if (Math.hypot(x - exitBtnX, y - exitBtnY) < 40) {
          setShowExitConfirm(true);
          setIsPaused(true);
      }
  };

  const handleDragStart = (key: keyof HUDLayout, e: React.PointerEvent | React.TouchEvent) => { if (!isCustomizing) return; const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.PointerEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.PointerEvent).clientY; dragOffset.current = { x: clientX - layout[key].x, y: clientY - layout[key].y }; setDragTarget(key); };
  const handleDragMove = (e: React.PointerEvent | React.TouchEvent) => { if (!isCustomizing || !dragTarget) return; const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.PointerEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.PointerEvent).clientY; setLayout(prev => ({ ...prev, [dragTarget]: { x: clientX - dragOffset.current.x, y: clientY - dragOffset.current.y } })); };
  const handleDragEnd = () => { setDragTarget(null); };
  const saveLayout = () => { localStorage.setItem('NEON_DRIFT_HUD_V2', JSON.stringify(layout)); setIsCustomizing(false); state.current.hudLayout = layout; };
  const resetLayout = () => { setLayout(getDefaultLayout()); };

  useEffect(() => {
    const keys = new Set<string>();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isPlaying) setIsPaused(prev => !prev); if (state.current.matchState !== 'COUNTDOWN') { if (e.code === 'Space') state.current.input.isBoosting = true; if (e.code === 'ShiftLeft') triggerAbility(1); if (e.code === 'ControlLeft') triggerAbility(2); if (e.code === 'KeyM') state.current.showMapOverlay = !state.current.showMapOverlay; } keys.add(e.code); updateKeys(); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') state.current.input.isBoosting = false; keys.delete(e.code); updateKeys(); };
    const updateKeys = () => { let mx = 0, my = 0; if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1; if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1; if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1; if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1; state.current.input.moveX = mx; state.current.input.moveY = my; };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    let lastTime = performance.now(); let frameCount = 0; let lastFpsTime = lastTime; let leaderboardTimer = 0; let squadTimer = 0;
    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.67, 3); lastTime = time; frameCountRef.current++;
      
      try {
          // Sync React state to GameState for animation logic
          state.current.menu.viewState = menuView;
          
          if (isPlaying) {
               update(dt);
               draw(ctx, canvas.width, canvas.height);
               leaderboardTimer += dt; squadTimer += dt;
               if (leaderboardTimer > 60) { const all = [state.current.player, ...state.current.bots]; all.sort((a, b) => b.score - a.score); setLeaderboardData([...all]); leaderboardTimer = 0; }
               if (squadTimer > 10) { const p = state.current.player; const squad = state.current.bots.filter(b => b.teamId === p.teamId); setSquadStatus([p, ...squad]); squadTimer = 0; }
          } else if (!isPlaying && activeTab === 'GARAGE') {
               drawMenu(ctx, canvas.width, canvas.height);
          } else if (!isPlaying && activeTab !== 'GARAGE') {
              ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.strokeStyle = '#111116'; ctx.lineWidth = 2; const gridSize = 100; ctx.beginPath(); for (let x = 0; x < canvas.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); } for (let y = 0; y < canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); } ctx.stroke();
          }
      } catch (e) {
          console.error("Game loop error (recovered):", e);
      }

      frameCount++; if (time - lastFpsTime >= 1000) { setFps(frameCount); frameCount = 0; lastFpsTime = time; }
      frameIdRef.current = requestAnimationFrame(loop);
    };
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const zoomChange = -e.deltaY * 0.001;
        const newZoom = Math.max(0.4, Math.min(1.5, state.current.camera.zoom + zoomChange));
        setZoomLevel(newZoom);
    };
    window.addEventListener('resize', resize); 
    window.addEventListener('wheel', handleWheel, { passive: false });
    resize(); frameIdRef.current = requestAnimationFrame(loop);
    return () => { 
        cancelAnimationFrame(frameIdRef.current); 
        window.removeEventListener('resize', resize); 
        window.removeEventListener('wheel', handleWheel);
    };
  }, [isPlaying, selectedSkinIndex, activeTab, unlockingCarId, selectedCarType, menuView, showModeSelect, selectedGameMode, isVisualizing, teammates]); // Added isVisualizing and teammates

  const update = (dt: number) => {
    const s = state.current;
    if(!isPlaying) { 
        // Menu animation: rotate hero car
        if (!s.menu.isDragging) s.menu.rotation += 0.005 * dt;
        
        // Smooth Transition Logic
        const targetProgress = s.menu.viewState === 'DETAIL' ? 1 : 0;
        // Lerp transitionProgress
        const speed = 0.1 * dt;
        s.menu.transitionProgress += (targetProgress - s.menu.transitionProgress) * speed;
        
        // Cinematic Zoom logic (Legacy, but kept for grid zoom if needed, or we can drive it by transitionProgress)
        // Let's drive cameraZoom by transitionProgress too for consistency
        // Overview Zoom: 1.0, Detail Zoom: 1.0 (We handle car scale separately now)
        // Actually, let's keep cameraZoom at 1.0 for now to simplify.
        s.menu.cameraZoom = 1.0; 
        s.menu.cameraYOffset = 0; // We handle Y offset in drawMenu now
        
        return; 
    }
    if (s.matchState === 'COUNTDOWN') {
        const secs = Math.ceil(s.matchTimer);
        if (secs !== lastBeepSecondRef.current) {
            lastBeepSecondRef.current = secs;
            audioService.playBeep(secs === 0);
        }
        s.matchTimer -= (dt / 60); if (s.matchTimer <= 0) { s.matchTimer = 0; s.matchState = 'PLAYING'; }
        s.input.moveX = 0; s.input.moveY = 0; s.input.isShooting = false; s.input.isBoosting = false;
        updateCarEntity(s.player, 0, 0, false, 0, 0, dt, s, true); s.bots.forEach(b => updateCarEntity(b, 0, 0, false, 0, 0, dt, s, true));
        s.camera.x = s.player.x; s.camera.y = s.player.y;
        return;
    }
    if ((s.matchState === 'VICTORY' || s.matchState === 'GAMEOVER') && !s.isSpectating) { s.bots.forEach(b => updateCarEntity(b, 0, 0, false, 0, 0, dt, s, true)); return; }

    const aliveTeams = new Set<number>(); if (!s.player.isDead) aliveTeams.add(s.player.teamId); s.bots.forEach(b => { if(!b.isDead) aliveTeams.add(b.teamId); });
    if (aliveTeams.size === 1 && aliveTeams.has(s.player.teamId) && s.matchTimer <= 0 && s.matchState !== 'VICTORY') {
        s.matchState = 'VICTORY';
        const finalEnergy = (s.player.score + (s.player.killStreak * 1000)) * 10; 
        s.announcement = { text: "VICTORY", subText: `HUGE EARNINGS: ${Math.floor(finalEnergy)}`, life: 9999, scale: 1, color: '#00ff00' };
        if (finalEnergy > 0) { setUserProfile(prev => ({...prev, currency: prev.currency + Math.floor(finalEnergy)})); s.player.score = 0; }
        
        setMatchResult('VICTORY');
        const entries: LeaderboardEntry[] = [s.player, ...s.bots].map(c => ({
            name: c.name || "Unknown",
            score: c.totalKills * 100 + c.score,
            kills: c.totalKills,
            energy: c.score,
            isPlayer: c.id === 'player',
            teamId: c.teamId,
            carType: c.typeIndex
        })).sort((a, b) => b.score - a.score);
        setLeaderboard(entries);
        setIsGameOver(true);
        return;
    }
    if (s.announcement) { s.announcement.life -= dt; if (s.announcement.life <= 0) s.announcement = null; }
    if (s.camera.shakeTrauma > 0) { s.camera.shakeTrauma = Math.max(0, s.camera.shakeTrauma - 0.02 * dt); const shake = s.camera.shakeTrauma * s.camera.shakeTrauma; s.camera.shakeX = (Math.random() * 2 - 1) * shake * 20; s.camera.shakeY = (Math.random() * 2 - 1) * shake * 20; } else { s.camera.shakeX = 0; s.camera.shakeY = 0; }

    for(let i = s.damageTexts.length - 1; i >= 0; i--) {
        const t = s.damageTexts[i];
        t.y -= t.velocityY * dt; t.life -= dt; t.scale = Math.max(0, t.scale - 0.005 * dt);
        if (t.life <= 0) s.damageTexts.splice(i, 1);
    }

    if (!s.player.isDead) {
        s.player.isBoosting = s.input.isBoosting; updateCarEntity(s.player, s.input.moveX, s.input.moveY, s.input.isShooting, s.input.aimX, s.input.aimY, dt, s);
        if(s.player.isBoosting && Math.hypot(s.player.vx, s.player.vy) > 20) { 
            if(Math.random() < 0.3) { const angle = Math.atan2(s.player.vy, s.player.vx) + Math.PI; const offset = 400 + Math.random() * 400; s.speedLines.push({ x: s.player.x + Math.cos(angle + (Math.random() - 0.5)) * offset, y: s.player.y + Math.sin(angle + (Math.random() - 0.5)) * offset, length: 50 + Math.random() * 100, speed: 2 + Math.random() * 2, alpha: 0.5 + Math.random() * 0.5 }); } 
        }
    } else {
        s.player.respawnTimer -= dt;
        const livingTeammates = s.bots.filter(b => b.teamId === s.player.teamId && !b.isDead);
        if (livingTeammates.length > 0) {
            let target = livingTeammates.find(t => t.id === s.camera.spectateTargetId); if (!target) { target = livingTeammates[0]; s.camera.spectateTargetId = target.id; } s.isSpectating = true;
            if (s.player.respawnTimer <= 0) { s.player.isDead = false; s.player.health = s.player.maxHealth; s.player.x = target.x; s.player.y = target.y; s.player.vx = 0; s.player.vy = 0; s.player.respawnTimer = 0; s.player.spawnAnim = 0; s.isSpectating = false; s.camera.spectateTargetId = null; spawnParticles(s, s.player.x, s.player.y, 50, '#00ffff', 5, 'shockwave'); triggerShake(0.5); }
        } else { 
            if (!s.isGameOver) { 
                s.isGameOver = true; s.matchState = 'GAMEOVER'; 
                setMatchResult('DEFEAT');
                const entries: LeaderboardEntry[] = [s.player, ...s.bots].map(c => ({
                    name: c.name || "Unknown",
                    score: c.totalKills * 100 + c.score,
                    kills: c.totalKills,
                    energy: c.score,
                    isPlayer: c.id === 'player',
                    teamId: c.teamId,
                    carType: c.typeIndex
                })).sort((a, b) => b.score - a.score);
                setLeaderboard(entries);
                setIsGameOver(true); 
                setKillerName("TEAM ELIMINATED"); 
                if (s.player.score > 0) { const lossEnergy = s.player.score * 5; setUserProfile(prev => ({...prev, currency: prev.currency + Math.floor(lossEnergy)})); s.player.score = 0; } 
            } 
        }
    }

    for(let i=s.speedLines.length-1; i>=0; i--) { const line = s.speedLines[i]; line.alpha -= 0.05 * dt; if(line.alpha <= 0) s.speedLines.splice(i, 1); }
    for(let i=s.killLog.length-1; i>=0; i--) { s.killLog[i].life -= dt; if (s.killLog[i].life <= 0) s.killLog.splice(i, 1); }

    const allCars = [s.player, ...s.bots].filter(c => !c.isDead);
    const grid: Record<string, CarEntity[]> = {};
    allCars.forEach(c => { const cx = Math.floor(c.x / SPATIAL_GRID_SIZE); const cy = Math.floor(c.y / SPATIAL_GRID_SIZE); const key = `${cx},${cy}`; if (!grid[key]) grid[key] = []; grid[key].push(c); });

    allCars.forEach(c1 => {
        const cx = Math.floor(c1.x / SPATIAL_GRID_SIZE); const cy = Math.floor(c1.y / SPATIAL_GRID_SIZE);
        for(let i=-1; i<=1; i++) { for(let j=-1; j<=1; j++) { const key = `${cx+i},${cy+j}`; if(grid[key]) { grid[key].forEach(c2 => { 
            if(c1.id !== c2.id && !c1.isDocked && !c2.isDocked && !c1.isJumping && !c2.isJumping && c1.z === 0 && c2.z === 0) { 
                const dist = Math.hypot(c1.x - c2.x, c1.y - c2.y); 
                const radiusSum = (getCarStats(c1.typeIndex).width + getCarStats(c2.typeIndex).width) / 1.5; 
                if (dist < radiusSum) { 
                    const w1 = getCarStats(c1.typeIndex).weight; const w2 = getCarStats(c2.typeIndex).weight; let crash = false; 
                    if (c1.isBoosting && !c2.isBoosting) { 
                        const impactSpeed = Math.hypot(c1.vx, c1.vy); const force = impactSpeed * 1.5; c2.vz = 15 + (impactSpeed * 0.5); const pushAngle = Math.atan2(c2.y - c1.y, c2.x - c1.x); c2.vx = Math.cos(pushAngle) * (force * 1.2); c2.vy = Math.sin(pushAngle) * (force * 1.2); takeDamage(c2, 10, s, c1); triggerShake(0.8); crash = true;
                    } 
                    else if (c2.isBoosting && !c1.isBoosting) { 
                        const impactSpeed = Math.hypot(c2.vx, c2.vy); const force = impactSpeed * 1.5; c1.vz = 15 + (impactSpeed * 0.5); const pushAngle = Math.atan2(c1.y - c2.y, c1.x - c2.x); c1.vx = Math.cos(pushAngle) * (force * 1.2); c1.vy = Math.sin(pushAngle) * (force * 1.2); takeDamage(c1, 10, s, c2); triggerShake(0.8); crash = true;
                    } 
                    else if (c1.isBoosting && c2.isBoosting) { takeDamage(c1, 15, s, c2); takeDamage(c2, 15, s, c1); c1.vz = 10; c2.vz = 10; crash = true; } 
                    else if (Math.abs(c1.vx) + Math.abs(c2.vx) > 10) { crash = true; } 
                    
                    if (crash) { 
                        if (!c1.isBoosting && !c2.isBoosting) triggerShake(0.3); 
                        if (c1.z === 0 && c2.z === 0) { const angle = Math.atan2(c1.y - c2.y, c1.x - c2.x); const force = 15; c1.vx += Math.cos(angle) * force * (w2/w1); c1.vy += Math.sin(angle) * force * (w2/w1); c2.vx -= Math.cos(angle) * force * (w1/w2); c2.vy -= Math.sin(angle) * force * (w1/w2); }
                    } 
                } 
            } 
        }); } } }
    });

    // Power Up Spawning
    if (s.matchState === 'PLAYING') {
        s.powerSpawnTimer = (s.powerSpawnTimer || 0) - dt;
        if (s.powerSpawnTimer <= 0) {
            spawnPowerUp(s);
            s.powerSpawnTimer = 600 + Math.random() * 600; // 10-20 seconds
        }
    }

    for (let i = s.orbs.length - 1; i >= 0; i--) {
        const orb = s.orbs[i];
        if (!orb.isMapOrb) { orb.x += orb.vx * dt; orb.y += orb.vy * dt; orb.vx *= 0.95; orb.vy *= 0.95; orb.life -= dt; if (orb.life <= 0) { s.orbs.splice(i, 1); continue; } }
        for (const car of allCars) {
            if (Math.abs(car.x - orb.x) > 200 || Math.abs(car.y - orb.y) > 200) continue; 
            if (car.isJumping) continue;
            const distSq = (car.x - orb.x)**2 + (car.y - orb.y)**2;
            if (distSq < 40000 && !car.isDocked) { const dist = Math.sqrt(distSq); const force = (200 - dist) * 0.008; const dx = car.x - orb.x; const dy = car.y - orb.y; orb.x += dx * force * dt; orb.y += dy * force * dt; }
            if (distSq < 3600 && !car.isDocked) { 
                if (orb.powerType !== 'NONE') {
                    // Add to inventory instead of immediate use
                    if (car.powerInventory.length < 4) {
                        car.powerInventory.push(orb.powerType);
                        if (car.id === 'player') {
                            s.announcement = { text: "POWER ACQUIRED", subText: orb.powerType, life: 60, scale: 1.0, color: POWER_COLORS[orb.powerType] };
                        }
                    } else {
                        // Inventory full - maybe replace oldest? Or just ignore.
                        // Let's replace the last one for now to keep flow going
                        car.powerInventory[3] = orb.powerType;
                    }
                } else {
                    car.score += orb.value; 
                    triggerEnergyPickup(s, car, orb.color);
                }
                const isLocalPlayer = car.id === (s.isSpectating ? s.camera.spectateTargetId : 'player');
                if (isLocalPlayer) audioService.playPickupSound(orb.isMapOrb);
                s.orbs.splice(i, 1); 
                break; 
            }
        }
    }

    s.stations.forEach(st => {
        if (!st.active) { st.cooldownTimer -= dt; if (st.cooldownTimer <= 0) { st.active = true; st.cooldownTimer = 0; st.occupantId = null; s.particles.push({ x: st.x, y: st.y, vx: 0, vy: 0, life: 40, maxLife: 40, color: st.color, size: 80, type: 'shockwave' }); } } else {
            let occupantFound = false; if (st.occupantId) { const occupant = allCars.find(c => c.id === st.occupantId); if (occupant && occupant.isDocked) { occupantFound = true; } else { st.occupantId = null; } }
            if (Math.random() < 0.3) { const screenDist = Math.abs(st.x - s.camera.x) + Math.abs(st.y - s.camera.y); if (screenDist < 1500) { const ang = Math.random() * Math.PI * 2; const d = 150 + Math.random() * 50; s.particles.push({ x: st.x + Math.cos(ang)*d, y: st.y + Math.sin(ang)*d, vx: -Math.cos(ang)*4, vy: -Math.sin(ang)*4, life: 40, maxLife: 40, color: st.color, size: 3, type: 'heal_orb' }); } }
        }
    });

    const currentFrame = frameCountRef.current;
    s.bots.forEach(bot => {
        let mx = 0, my = 0, aimX = 0, aimY = 0, shoot = false; const stats = getCarStats(bot.typeIndex);
        const shouldUpdateAI = (currentFrame + bot.tickOffset) % 3 === 0;
        if (!bot.isDead && !bot.isDocked) { 
            bot.aiChangeTimer = (bot.aiChangeTimer || 0) - dt; bot.aiReactionTimer = (bot.aiReactionTimer || 0) - dt;
            if (shouldUpdateAI) {
                let closestEnemy: CarEntity | null = null; let enemyDist = 5000;
                for(const c of allCars) { if (c.id !== bot.id && c.teamId !== bot.teamId && !c.isDead && !c.isJumping && !c.isStealth) { const d = (c.x - bot.x)**2 + (c.y - bot.y)**2; if (d < enemyDist**2) { enemyDist = Math.sqrt(d); closestEnemy = c; } } }
                let closestOrb: Orb | null = null; let orbDist = 5000;
                if (!closestEnemy || enemyDist > 1000) { for(let i=0; i<s.orbs.length; i+=2) { const o = s.orbs[i]; const d = (o.x - bot.x)**2 + (o.y - bot.y)**2; if (d < orbDist**2) { orbDist = Math.sqrt(d); closestOrb = o; } } }
                let closestStation: HealingStation | null = null;
                if (bot.health < bot.maxHealth * 0.4) { let stationDist = 99999; s.stations.forEach(st => { if (st.active && (!st.occupantId || st.occupantId === bot.id)) { const d = Math.hypot(st.x - bot.x, st.y - bot.y); if (d < stationDist) { stationDist = d; closestStation = st; } } }); }
                if (stats.ability === 'jump' && bot.ability1Charges > 0 && enemyDist < 300 && !bot.isJumping && Math.random() < 0.05) { bot.isJumping = true; bot.vz = 18; bot.z = 1; bot.ability1Charges--; }
                if (stats.ability === 'stealth' && bot.ability1Charges > 0 && enemyDist < 800 && bot.health < bot.maxHealth * 0.5 && !bot.isStealth && Math.random() < 0.05) { bot.isStealth = true; bot.ability1ActiveTimer = 300; bot.ability1Charges--; }
                if (stats.secondaryAbility === 'fire_breath' && bot.ability2Charges > 0 && enemyDist < 250 && bot.ability2ActiveTimer <= 0 && Math.random() < 0.05) { bot.ability2ActiveTimer = 240; bot.ability2Charges--; }
                if (closestStation && bot.dockTimer <= 0) { bot.aiState = 'heal'; bot.aiTarget = { x: closestStation.x, y: closestStation.y }; } else if (closestOrb && orbDist < 800) { bot.aiState = 'collect'; bot.aiTarget = { x: closestOrb.x, y: closestOrb.y }; } else if (closestEnemy && enemyDist < 1200) { bot.aiState = 'chase'; bot.aiTarget = { x: closestEnemy.x, y: closestEnemy.y }; } else if (bot.aiChangeTimer <= 0) { bot.aiState = 'wander'; const ang = Math.random() * Math.PI * 2; const dist = Math.random() * (s.currentArenaRadius * 0.8); bot.aiTarget = { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist }; bot.aiChangeTimer = 100 + Math.random() * 200; }
            }
            if (bot.aiState === 'heal' && bot.aiTarget) { const dx = bot.aiTarget.x - bot.x; const dy = bot.aiTarget.y - bot.y; const dist = Math.hypot(dx, dy); if (dist > 0.1) { mx = dx/dist; my = dy/dist; } aimX = Math.cos(bot.angle); aimY = Math.sin(bot.angle); }
            else if (bot.aiState === 'collect' && bot.aiTarget) { const dx = bot.aiTarget.x - bot.x; const dy = bot.aiTarget.y - bot.y; const dist = Math.hypot(dx, dy); if (dist > 0.1) { mx = dx/dist; my = dy/dist; } aimX = Math.cos(bot.angle); aimY = Math.sin(bot.angle); }
            else if (bot.aiState === 'chase' && bot.aiTarget) { const dx = bot.aiTarget.x - bot.x; const dy = bot.aiTarget.y - bot.y; const dist = Math.hypot(dx, dy); if (dist > 100) { mx = dx/dist; my = dy/dist; } aimX = dx; aimY = dy; if (dist < 700) shoot = true; }
            else { if (bot.aiTarget) { const dx = bot.aiTarget.x - bot.x; const dy = bot.aiTarget.y - bot.y; const dist = Math.hypot(dx, dy); if (dist > 100) { mx = dx/dist; my = dy/dist; } } aimX = Math.cos(bot.angle); aimY = Math.sin(bot.angle); }
            
            let sepX = 0; let sepY = 0; 
            const cx = Math.floor(bot.x / SPATIAL_GRID_SIZE); const cy = Math.floor(bot.y / SPATIAL_GRID_SIZE);
            for(let i=-1; i<=1; i++) { for(let j=-1; j<=1; j++) { const key = `${cx+i},${cy+j}`; if(grid[key]) { grid[key].forEach(other => { if (other.id !== bot.id) { const distSq = (other.x - bot.x)**2 + (other.y - bot.y)**2; if (distSq < 90000) { const dist = Math.sqrt(distSq); const pushAng = Math.atan2(bot.y - other.y, bot.x - other.x); const force = (300 - dist) / 300; sepX += Math.cos(pushAng) * force * 1.5; sepY += Math.sin(pushAng) * force * 1.5; } } }); } } }
            mx += sepX; my += sepY; const inpMag = Math.hypot(mx, my); if (inpMag > 1) { mx /= inpMag; my /= inpMag; }
            if (bot.aiState === 'chase' && Math.random() < 0.02) bot.isBoosting = true; if (bot.aiState === 'flee') bot.isBoosting = true; if (bot.boostFuel <= 0) bot.isBoosting = false;
        }
        updateCarEntity(bot, mx * 0.75, my * 0.75, shoot, aimX, aimY, dt, s);
    });

    for (let j = s.particles.length - 1; j >= 0; j--) { 
        const pt = s.particles[j]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; 
        
        // 3D Physics for Shells / Debris
        if (pt.z !== undefined && pt.vz !== undefined) {
            pt.z += pt.vz * dt;
            pt.vz -= GRAVITY * dt; // Gravity
            if (pt.z <= 0) {
                pt.z = 0;
                pt.vz *= -0.5; // Bounce with damping
                pt.vx *= 0.8; pt.vy *= 0.8; // Friction on ground
                if (Math.abs(pt.vz) < 2) pt.vz = 0;
            }
        } else if(pt.type !== 'heal_orb' && pt.type !== 'energy_swirl') { 
            pt.vx *= 0.95; pt.vy *= 0.95; 
        } 
        
        pt.life -= dt; 
        
        if (pt.type === 'energy_swirl' && pt.orbitDist) {
            // Spiral math
            pt.orbitAngle = (pt.orbitAngle || 0) + 0.1 * dt;
            const orbitRadius = Math.max(0, pt.orbitDist - (pt.life/pt.maxLife) * 10); // Spiraling out slightly?
            // Actually let's make them spiral AWAY from origin point or stay relative to car?
            // Current implementation is simple velocity based.
        }

        if (pt.type === 'fluid' && pt.life <= 0) { if (Math.random() < 0.5) { s.groundDecals.push({ x: pt.x, y: pt.y, scale: 0.2 + Math.random() * 0.3, color: pt.color, alpha: 0.7, life: 2000, maxLife: 2000, rotation: Math.random() * Math.PI * 2, type: 'splatter' }); } }
        if (pt.life <= 0) s.particles.splice(j, 1); 
    }
    for(let i=s.groundDecals.length-1; i>=0; i--) { const d = s.groundDecals[i]; d.life -= dt; if(d.life < 100) d.alpha = d.life / 100; if(d.life <= 0) s.groundDecals.splice(i, 1); }

    for (let j = s.bullets.length - 1; j >= 0; j--) {
        const b = s.bullets[j]; 
        const prevX = b.x; const prevY = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; 
        let hit = false;
        
        // HOMING LOGIC (Improved)
        let closestTarget: CarEntity | null = null; let minHomingDist = 500; 
        const potentialTargets = [s.player, ...s.bots].filter(t => t.id !== b.ownerId && t.teamId !== b.ownerTeamId && !t.isDead && !t.isStealth && t.z === 0);
        for (const t of potentialTargets) { const dist = Math.hypot(t.x - b.x, t.y - b.y); if (dist < minHomingDist) { minHomingDist = dist; closestTarget = t; } }
        
        if (closestTarget) {
            const dx = closestTarget.x - b.x;
            const dy = closestTarget.y - b.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < 150) {
                const pullStrength = 0.4 * (1 - dist / 150);
                b.vx += dx * pullStrength;
                b.vy += dy * pullStrength;
                const speed = Math.hypot(b.vx, b.vy);
                const targetSpeed = getCarStats(b.ownerId === 'player' ? s.player.typeIndex : s.bots.find(bot => bot.id === b.ownerId)?.typeIndex || 0).bulletSpeed;
                if (speed > 0) {
                    b.vx = (b.vx / speed) * targetSpeed;
                    b.vy = (b.vy / speed) * targetSpeed;
                }
            } else {
                const targetAngle = Math.atan2(dy, dx); 
                const currentAngle = Math.atan2(b.vy, b.vx); 
                let diff = targetAngle - currentAngle; 
                while (diff < -Math.PI) diff += Math.PI * 2; 
                while (diff > Math.PI) diff -= Math.PI * 2; 
                const baseTurnRate = 0.15;
                const proximityBonus = (1 - (dist / 500)) * 0.25;
                const turnRate = baseTurnRate + Math.max(0, proximityBonus); 
                const turn = Math.max(-turnRate, Math.min(turnRate, diff));
                const speed = Math.hypot(b.vx, b.vy); 
                const newAngle = currentAngle + turn;
                b.vx = Math.cos(newAngle) * speed; 
                b.vy = Math.sin(newAngle) * speed;
            }
        }

        if (Math.hypot(b.x, b.y) > s.currentArenaRadius) { 
            if (b.bounces && (b.bounceCount || 0) < 3) { 
                const angleToCenter = Math.atan2(b.y, b.x); const normalX = Math.cos(angleToCenter); const normalY = Math.sin(angleToCenter); const dot = b.vx * normalX + b.vy * normalY; b.vx = b.vx - 2 * dot * normalX; b.vy = b.vy - 2 * dot * normalY; b.x -= normalX * 5; b.y -= normalY * 5; b.bounceCount = (b.bounceCount || 0) + 1; spawnParticles(s, b.x, b.y, 3, b.color, 1, 'spark'); 
            } else { 
                hit = true; spawnParticles(s, b.x, b.y, 12, b.color, 3, 'spark'); spawnParticles(s, b.x, b.y, 8, '#ffffff', 5, 'spark'); s.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 10, maxLife: 10, color: '#ffffff', size: 40, type: 'impact' }); s.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 20, maxLife: 20, color: b.color, size: 60, type: 'shockwave' }); if(Math.random() < 0.7) s.groundDecals.push({ x: b.x, y: b.y, scale: 0.6 + Math.random() * 0.4, color: '#111', alpha: 0.6, life: 200, maxLife: 200, rotation: Math.random() * Math.PI * 2, type: 'scorch' });
            } 
        }

        if (!hit) {
            const distMoved = Math.hypot(b.vx * dt, b.vy * dt);
            const steps = Math.max(1, Math.ceil(distMoved / 25)); 
            
            for (let step = 1; step <= steps && !hit; step++) {
                const checkX = prevX + (b.vx * dt) * (step / steps);
                const checkY = prevY + (b.vy * dt) * (step / steps);
                const bx = Math.floor(checkX / SPATIAL_GRID_SIZE); 
                const by = Math.floor(checkY / SPATIAL_GRID_SIZE); 
                const key = `${bx},${by}`;
                
                if(grid[key]) { 
                    for(const entity of grid[key]) { 
                        if (entity.id === b.ownerId || entity.teamId === b.ownerTeamId || entity.isDead || entity.respawnTimer > 0 || entity.isDocked || entity.isJumping) continue; 
                        
                        const distSq = (checkX - entity.x)**2 + (checkY - entity.y)**2;
                        const hitRadiusSq = 2500; 
                        
                        if (distSq < hitRadiusSq) { 
                            let finalDamage = b.damage; 
                            const shooter = [s.player, ...s.bots].find(c => c.id === b.ownerId); 
                            if (shooter) { 
                                const distToShooter = Math.hypot(shooter.x - entity.x, shooter.y - entity.y);
                                const proximityMult = Math.max(1, 2.5 - (distToShooter / 500));
                                const stats = getCarStats(shooter.typeIndex); 
                                if (stats.name === 'EAGLE') { 
                                    const sniperMult = Math.max(0.2, Math.min(1.5, distToShooter / 1500)); 
                                    finalDamage = b.damage * sniperMult * proximityMult; 
                                } else {
                                    finalDamage = b.damage * proximityMult;
                                }
                            } 
                            entity.damageFlash = 1.0; 
                            entity.lastHealTime = performance.now(); 
                            spawnParticles(s, checkX, checkY, 5, b.color, 1, 'impact'); 
                            const bloodColor = getSkin(entity.skinIndex).colors[0]; 
                            spawnParticles(s, checkX, checkY, 15, bloodColor, 3, 'fluid'); 
                            if(Math.random() < 0.4) s.groundDecals.push({ x: checkX, y: checkY, scale: 0.3 + Math.random() * 0.2, color: bloodColor, alpha: 0.8, life: 1500, maxLife: 1500, rotation: Math.random() * Math.PI * 2, type: 'splatter' });
                            takeDamage(entity, finalDamage, s, shooter); 
                            if (b.ownerId === 'player') { entity.hitMarkerTimer = 30; triggerShake(0.1); } 
                            hit = true; 
                            break; 
                        } 
                    } 
                }
            }
        }
        if (hit || b.life <= 0) { s.bullets.splice(j, 1); }
    }

    let focusX, focusY;
    if (s.isSpectating || s.player.isDead) { 
        let target = [s.player, ...s.bots].find(c => c.id === s.camera.spectateTargetId); 
        
        // Follow killer chain
        if (target && target.isDead && target.killerId) {
            const killer = [s.player, ...s.bots].find(c => c.id === target?.killerId);
            if (killer && !killer.isDead) {
                target = killer;
                s.camera.spectateTargetId = killer.id;
            }
        }

        if (!target || target.isDead) {
            // Fallback: Find any alive enemy if chain is broken
            const alive = [s.player, ...s.bots].filter(c => !c.isDead);
            if (alive.length > 0) {
                target = alive[0];
                s.camera.spectateTargetId = target.id;
            }
        }
        if (target) { focusX = target.x; focusY = target.y; } else { focusX = s.camera.x; focusY = s.camera.y; } 
    } else { 
        focusX = s.player.x; focusY = s.player.y; 
    }
    const lookAheadFactor = 0; let targetX = focusX + (s.isSpectating ? 0 : s.player.vx * lookAheadFactor); let targetY = focusY + (s.isSpectating ? 0 : s.player.vy * lookAheadFactor);
    const playerStats = getCarStats(s.player.typeIndex);
    if (!s.isSpectating && !s.player.isDead) { 
        if (Math.abs(s.input.aimX) > 0.1 || Math.abs(s.input.aimY) > 0.1) { 
            const offsetMag = playerStats.ability === 'sniper' ? 600 : 300;
            s.camera.offsetTargetX = s.input.aimX * offsetMag; 
            s.camera.offsetTargetY = s.input.aimY * offsetMag; 
        } else { 
            s.camera.offsetTargetX = 0; 
            s.camera.offsetTargetY = 0; 
        } 
    } else { 
        s.camera.offsetTargetX = 0; 
        s.camera.offsetTargetY = 0; 
    }
    s.camera.offsetX += (s.camera.offsetTargetX - s.camera.offsetX) * 0.05 * dt; s.camera.offsetY += (s.camera.offsetTargetY - s.camera.offsetY) * 0.05 * dt; targetX += s.camera.offsetX; targetY += s.camera.offsetY;
    s.camera.x = targetX; s.camera.y = targetY;
  };

  const updateCarEntity = (p: CarEntity, moveX: number, moveY: number, isShooting: boolean, aimX: number, aimY: number, dt: number, s: GameState, frozen: boolean = false) => {
    const stats = getCarStats(p.typeIndex);
    if (p.muzzleFlashTimer > 0) p.muzzleFlashTimer -= dt;
    if (p.hitMarkerTimer > 0) p.hitMarkerTimer -= dt;
    if (p.damageFlash > 0) p.damageFlash = Math.max(0, p.damageFlash - 0.1 * dt);
    if (p.dockTimer > 0) p.dockTimer -= dt;
    if (p.energySwirlTimer > 0) p.energySwirlTimer -= dt; // Cinematic effect timer

    // --- CINEMATIC UI UPDATES ---
    // Smooth Health
    p.visualHealth += (p.health - p.visualHealth) * 0.1 * dt;
    
    // Floating Tag Physics (Smooth Follow - No Bounce)
    if (!frozen) {
        const targetTagX = p.x;
        const targetTagY = p.y - 100 - p.z * 5; // Higher target (100px)
        
        // Smooth Lerp (Exponential Decay) - Non-oscillatory
        // Speed factor: 0.15 is snappy but smooth.
        const lerpSpeed = 0.15;
        
        p.tagPos.x += (targetTagX - p.tagPos.x) * lerpSpeed * dt;
        p.tagPos.y += (targetTagY - p.tagPos.y) * lerpSpeed * dt;
        
        // Hard Constraint: Prevent overlap (Passar por cima)
        // Ensure tag is ALWAYS at least 60px above the car center
        const limitY = p.y - 60;
        if (p.tagPos.y > limitY) {
            p.tagPos.y = limitY;
        }
        
        // Reset velocity if we switch back to physics later, but for now we are position-based.
        p.tagPos.vx = 0; 
        p.tagPos.vy = 0;
    }

    // --- POWER UP LOGIC ---
    if (p.powerTimer > 0) {
        p.powerTimer -= dt;
        if (p.activePower === 'GHOST') { p.isStealth = true; p.health = Math.min(p.maxHealth, p.health + 0.1 * dt); }
        if (p.powerTimer <= 0) {
            p.activePower = 'NONE';
            if (p.id === 'player') s.announcement = { text: "POWER DOWN", life: 60, scale: 0.8, color: '#aaa' };
        }
    }

    if (frozen) return; 

    if (p.ability1Cooldown > 0) p.ability1Cooldown -= dt; if (p.ability2Cooldown > 0) p.ability2Cooldown -= dt;
    if (p.ability1ActiveTimer > 0) p.ability1ActiveTimer -= dt; if (p.ability2ActiveTimer > 0) p.ability2ActiveTimer -= dt;

    if (p.isStealth && p.ability1ActiveTimer <= 0) { p.isStealth = false; p.ability1Cooldown = STEALTH_COOLDOWN_FRAMES; spawnParticles(s, p.x, p.y, 20, '#ff0000', 2, 'spark'); }
    if (p.ability2ActiveTimer > 0 && stats.secondaryAbility === 'fire_breath') {
         if (p.ability2ActiveTimer % 3 < 1) { 
            const fireAngle = p.turretAngle + (Math.random() - 0.5) * 0.5; const dist = Math.random() * 250; const fx = p.x + Math.cos(fireAngle) * dist; const fy = p.y + Math.sin(fireAngle) * dist;
            s.particles.push({x: p.x + Math.cos(p.turretAngle)*20, y: p.y + Math.sin(p.turretAngle)*20, vx: Math.cos(fireAngle)*15, vy: Math.sin(fireAngle)*15, life: 30 + Math.random()*20, maxLife: 50, color: '#ff5500', size: 5 + Math.random()*15, type: 'fire'});
            if (Math.random() < 0.1) { s.groundDecals.push({x: fx, y: fy, scale: 0.5 + Math.random(), color: '#331100', alpha: 0.8, life: 1000, maxLife: 1000, rotation: Math.random()*6, type: 'scorch'}); }
            [s.player, ...s.bots].forEach(t => { if (t.id !== p.id && t.teamId !== p.teamId && !t.isDead && Math.hypot(t.x - p.x, t.y - p.y) < 300) { const angToT = Math.atan2(t.y - p.y, t.x - p.x); const diff = Math.abs(angToT - p.turretAngle); if (diff < 0.6 || diff > Math.PI * 2 - 0.6) { takeDamage(t, 0.8, s, p); } } });
         }
         if (p.ability2ActiveTimer <= 1) p.ability2Cooldown = FIRE_COOLDOWN_FRAMES;
    }

    if (p.tongueState !== 'idle') {
        const tongueSpeed = 30;
        if (p.tongueState === 'out') {
            let closestT = null; let closestD = p.tongueMaxLen * 1.2; 
            [s.player, ...s.bots].forEach(t => { if(t.id !== p.id && t.teamId !== p.teamId && !t.isDead && !t.isStealth) { const dist = Math.hypot(t.x - p.x, t.y - p.y); if (dist < closestD) { const angTo = Math.atan2(t.y - p.y, t.x - p.x); let diff = angTo - p.tongueAngle; while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2; if (Math.abs(diff) < 0.8) { closestD = dist; closestT = t; } } } });
            if (closestT) { const targetAng = Math.atan2((closestT as CarEntity).y - p.y, (closestT as CarEntity).x - p.x); let diff = targetAng - p.tongueAngle; while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2; p.tongueAngle += diff * 0.15 * dt; }
            p.tongueLength += tongueSpeed * dt; if (p.tongueLength >= p.tongueMaxLen) p.tongueState = 'in';
            const tx = p.x + Math.cos(p.tongueAngle) * p.tongueLength; const ty = p.y + Math.sin(p.tongueAngle) * p.tongueLength; const target = [s.player, ...s.bots].find(t => t.id !== p.id && t.teamId !== p.teamId && !t.isDead && Math.hypot(t.x - tx, t.y - ty) < 60); 
            if (target) { p.tongueState = 'pull'; p.tongueTargetId = target.id; p.tongueLength = Math.hypot(target.x - p.x, target.y - p.y); spawnParticles(s, tx, ty, 10, '#ff00ff', 2, 'fluid'); }
        } else if (p.tongueState === 'in') { p.tongueLength -= tongueSpeed * 1.5 * dt; if (p.tongueLength <= 0) { p.tongueState = 'idle'; p.ability2Cooldown = TONGUE_COOLDOWN_FRAMES; } } else if (p.tongueState === 'pull') { const target = [s.player, ...s.bots].find(t => t.id === p.tongueTargetId); if (!target || target.isDead) { p.tongueState = 'in'; p.tongueTargetId = null; } else { const dx = p.x - target.x; const dy = p.y - target.y; const dist = Math.hypot(dx, dy); if (dist < 50) { p.tongueState = 'idle'; p.ability2Cooldown = TONGUE_COOLDOWN_FRAMES; } else { const pullForce = 2.5 * dt; target.vx += (dx / dist) * pullForce; target.vy += (dy / dist) * pullForce; p.vx -= (dx / dist) * pullForce * 0.2; p.vy -= (dy / dist) * pullForce * 0.2; } } }
    }

    if (p.z > 0) {
        p.vz -= GRAVITY * dt; 
        p.z += p.vz * dt;
        if (p.z > 5) { p.angle += (p.vx * 0.005) * dt; }
        if (stats.ability !== 'jump' || !p.isJumping) { moveX = 0; moveY = 0; p.vx *= 0.98; p.vy *= 0.98; }
    } 
    
    if (p.z <= 0 && p.vz < 0) {
        p.z = 0;
        if (p.vz < -10) {
             spawnParticles(s, p.x, p.y, 10, '#ffffff', 2, 'smoke');
             spawnParticles(s, p.x, p.y, 5, '#555555', 3, 'debris');
             if (Math.abs(p.vz) > 20 && p.id === 'player') triggerShake(0.3);
             p.vz = -p.vz * 0.3; 
             if(Math.abs(p.vz) < 2) p.vz = 0;
        } else { p.vz = 0; }
    }
    if (p.z < 0) p.z = 0; 

    if (p.isJumping) {
        if (p.z === 0 && p.vz === 0) { p.vz = 18; }
        if (p.z <= 0 && p.vz <= 0) {
            p.isJumping = false; 
            s.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 20, maxLife: 20, color: '#aaa', size: 40, type: 'shockwave' });
            if (stats.name === 'FROG') { triggerShake(0.5); spawnParticles(s, p.x, p.y, 30, '#00ff00', 3, 'smoke'); spawnParticles(s, p.x, p.y, 20, '#ffffff', 5, 'debris'); s.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 30, maxLife: 30, color: '#00ff00', size: 250, type: 'shockwave' }); [s.player, ...s.bots].forEach(t => { if (t.id !== p.id && t.teamId !== p.teamId && !t.isDead) { const dist = Math.hypot(t.x - p.x, t.y - p.y); if (dist < 250) { const force = (250 - dist) / 250; takeDamage(t, 40 * force, s, p); const ang = Math.atan2(t.y - p.y, t.x - p.x); t.vx += Math.cos(ang) * 40 * force; t.vy += Math.sin(ang) * 40 * force; } } }); }
        }
    }
    
    if (stats.ability === 'jump' && p.ability1Charges < 3) { p.ability1Cooldown += dt; if (p.ability1Cooldown >= JUMP_COOLDOWN_FRAMES) { p.ability1Charges++; p.ability1Cooldown = 0; } }
    if (p.ability1Cooldown > 0) p.ability1Cooldown -= dt; 
    if (p.reloadTimer > 0) { p.reloadTimer -= dt; if (p.reloadTimer <= 0) p.ammo = p.maxAmmo; }
    if (p.spawnAnim < 1) { p.spawnAnim += 0.02 * dt; if (p.spawnAnim > 1) p.spawnAnim = 1; }
    if (!p.isDocked && p.health < p.maxHealth && p.health > 0) { p.health = Math.min(p.maxHealth, p.health + p.baseRegen * dt); }

    s.stations.forEach(st => {
        if (!st.active) return; 
        const dx = st.x - p.x; 
        const dy = st.y - p.y; 
        const dist = Math.hypot(dx, dy);
        
        // Pull effect when near
        if (dist < HEAL_RADIUS && p.dockTimer <= 0 && p.z === 0) { 
            const pullStrength = (HEAL_RADIUS - dist) / HEAL_RADIUS; 
            p.vx += dx * 0.01 * pullStrength * dt; 
            p.vy += dy * 0.01 * pullStrength * dt; 
        }
        
        // Docking Logic
        if (dist < DOCK_RADIUS && p.dockTimer <= 0 && p.health < p.maxHealth && p.z === 0) { 
            if (!st.occupantId || st.occupantId === p.id) { 
                st.occupantId = p.id; 
                p.isDocked = true; 
                
                // Suck in (Interpolate to center)
                p.vx *= 0.8; p.vy *= 0.8; 
                p.x += (st.x - p.x) * 0.15 * dt; 
                p.y += (st.y - p.y) * 0.15 * dt; 
                
                // Float Up & Spin
                p.z = Math.min(20, p.z + 1 * dt); // Float to height 20
                p.angle += 0.2 * dt; // Spin
                
                // Heal
                p.health += 2.0 * dt; // Faster healing
                
                // Eject / Throw Logic
                if (p.health >= p.maxHealth) { 
                    p.health = p.maxHealth; 
                    p.isDocked = false; 
                    p.dockTimer = 180; 
                    st.active = false; 
                    st.cooldownTimer = STATION_COOLDOWN; 
                    st.occupantId = null; 
                    
                    // Calculate Throw Direction (Away from enemies + Randomness)
                    let throwAngle = Math.random() * Math.PI * 2;
                    let nearestEnemyDist = Infinity;
                    let nearestEnemyAngle = 0;
                    
                    s.bots.forEach(b => {
                        if (b.teamId !== p.teamId && !b.isDead) {
                            const d = Math.hypot(b.x - p.x, b.y - p.y);
                            if (d < nearestEnemyDist) {
                                nearestEnemyDist = d;
                                nearestEnemyAngle = Math.atan2(b.y - p.y, b.x - p.x);
                            }
                        }
                    });
                    
                    if (nearestEnemyDist < 2000) {
                        // Throw away from nearest enemy
                        throwAngle = nearestEnemyAngle + Math.PI + (Math.random() - 0.5); // Opposite direction +/- random
                    }
                    
                    // Launch!
                    const throwForce = 60; // Strong throw
                    p.vx = Math.cos(throwAngle) * throwForce; 
                    p.vy = Math.sin(throwAngle) * throwForce; 
                    p.vz = 15; // Jump up
                    p.z = 20; // Ensure starting height
                    
                    // Effects
                    s.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 30, maxLife: 30, color: st.color, size: 150, type: 'shockwave' }); 
                    spawnParticles(s, p.x, p.y, 50, st.color, 5, 'spark'); 
                    triggerShake(0.6); 
                } 
            } 
        } else if (st.occupantId === p.id && (dist >= DOCK_RADIUS || p.health >= p.maxHealth)) { 
            // Force eject if drifted away (shouldn't happen with suck-in, but safety)
            st.occupantId = null; 
            p.isDocked = false; 
            p.z = Math.max(0, p.z); // Drop if floating
        }
    });
    
    if (p.isDocked) return;
    if (p.isBoosting && p.boostFuel > 0 && p.z === 0) { 
        p.boostFuel -= BOOST_DRAIN * dt; if(p.boostFuel < 0) { p.boostFuel = 0; p.isBoosting = false; }
        const offset = -stats.length / 2; const px = p.x + Math.cos(p.angle) * offset; const py = p.y + Math.sin(p.angle) * offset;
        const skin = getSkin(p.skinIndex);
        
        // UNIQUE NITRO EFFECTS (Cinematic Enhanced)
        if (stats.name === "VOLTAGE") {
            // Electric Sparks - High frequency, erratic
            for(let i=0; i<4; i++) {
                const angle = p.angle + Math.PI + (Math.random()-0.5) * 0.5;
                const speed = 20 + Math.random() * 15;
                s.particles.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * speed + p.vx * 0.5,
                    vy: Math.sin(angle) * speed + p.vy * 0.5,
                    life: 15 + Math.random() * 15, maxLife: 30,
                    color: Math.random() > 0.5 ? '#00ffff' : '#ffffff',
                    size: 2 + Math.random() * 3, type: 'spark'
                });
            }
        } else if (stats.name === "TITAN") {
            // Heavy Smoke + Fire - Dense, lingering
            if (Math.random() < 0.8) {
                s.particles.push({
                    x: px + (Math.random()-0.5)*15, y: py + (Math.random()-0.5)*15,
                    vx: p.vx * 0.05, vy: p.vy * 0.05,
                    life: 50 + Math.random() * 30, maxLife: 80,
                    color: '#1a1a1a', size: 12 + Math.random() * 12, type: 'smoke'
                });
            }
            for(let i=0; i<2; i++) {
                s.particles.push({
                    x: px + (Math.random()-0.5)*5, y: py + (Math.random()-0.5)*5,
                    vx: Math.cos(p.angle + Math.PI + (Math.random()-0.5)*0.2) * 25, 
                    vy: Math.sin(p.angle + Math.PI + (Math.random()-0.5)*0.2) * 25,
                    life: 25, maxLife: 25, color: '#ff4400', size: 8, type: 'fire'
                });
            }
        } else if (stats.name === "EAGLE") {
            // Clean Blue Jet Flame - Long, focused
            const angle = p.angle + Math.PI;
            // Core flame
            s.particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * 40 + p.vx, vy: Math.sin(angle) * 40 + p.vy,
                life: 20, maxLife: 20, color: '#00aaff', size: 5, type: 'fire'
            });
            // Mach diamonds / Shockwave rings
            if (Math.random() < 0.3) {
                 s.particles.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * 35 + p.vx, vy: Math.sin(angle) * 35 + p.vy,
                    life: 10, maxLife: 10, color: '#ffffff', size: 8, type: 'shockwave'
                });
            }
        } else if (stats.name === "REI DO INFERNO") {
            // Massive Fire Trail - Wide, chaotic
            for(let i=0; i<5; i++) {
                const spread = (Math.random() - 0.5) * 1.0;
                const angle = p.angle + Math.PI + spread;
                s.particles.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * 18, vy: Math.sin(angle) * 18,
                    life: 40 + Math.random() * 20, maxLife: 60,
                    color: Math.random() > 0.3 ? '#ff5500' : '#ffaa00',
                    size: 6 + Math.random() * 10, type: 'fire'
                });
            }
        } else if (stats.name === "PHANTOM") {
            // Void / Ghost Trail - Ethereal
            s.particles.push({
                x: px + (Math.random()-0.5)*5, y: py + (Math.random()-0.5)*5,
                vx: 0, vy: 0,
                life: 40, maxLife: 40,
                color: '#aa00ff', size: 10, type: 'smoke'
            });
            s.particles.push({
                x: px, y: py,
                vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2,
                life: 20, maxLife: 20,
                color: '#ffffff', size: 2, type: 'spark'
            });
        } else {
            // Standard Nitro - Balanced
            for(let i = 0; i < 3; i++) {
                const spread = (Math.random() - 0.5) * 0.5;
                const nitroAngle = p.angle + Math.PI + spread;
                const speed = 15 + Math.random() * 20;
                const life = 30 + Math.random() * 20;
                const color = Math.random() > 0.3 ? skin.glowColor : '#ffffff';
                s.particles.push({ 
                    x: px + (Math.random()-0.5)*8, y: py + (Math.random()-0.5)*8, 
                    vx: Math.cos(nitroAngle) * speed + p.vx * 0.3, 
                    vy: Math.sin(nitroAngle) * speed + p.vy * 0.3, 
                    life, maxLife: life, color, size: 3 + Math.random()*5, type: 'fire' 
                });
            }
        }

    } else { p.isBoosting = false; if (p.boostFuel < MAX_BOOST) { p.boostFuel += BOOST_REGEN * dt; if (p.boostFuel > MAX_BOOST) p.boostFuel = MAX_BOOST; } }

    const maxSpd = (p.isBoosting ? p.statNitroSpeed : p.statSpeed);
    
    // --- PHYSICS & DRIFT SYSTEM ---
    // 1. Rotation: Turn towards INPUT direction (not velocity), allowing drift angle
    if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
        const inputAngle = Math.atan2(moveY, moveX);
        let diff = inputAngle - p.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const turnSpeed = p.z > 0 ? 0.3 : 1.0;
        // Heavier cars turn slower
        const turnRate = (0.12 * (1 / stats.weight)) * turnSpeed; 
        p.angle += diff * turnRate * dt;
        
        // Wheel steering visual
        let steerAngle = diff * 2.0; 
        if (steerAngle > 0.8) steerAngle = 0.8; 
        if (steerAngle < -0.8) steerAngle = -0.8; 
        p.steering += (steerAngle - p.steering) * 0.2 * dt;
    } else {
        p.steering *= 0.8;
    }

    // 2. Acceleration: Apply force
    if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) { 
        const control = p.z > 0 ? 0.2 : 1.0; // Reduced air control
        p.vx += moveX * ACCELERATION * control * dt; 
        p.vy += moveY * ACCELERATION * control * dt; 
    }

    // 3. Friction & Drift Physics
    const currentSpeed = Math.hypot(p.vx, p.vy);
    if (currentSpeed > 0.1 && p.z === 0) {
        // Decompose velocity into Forward (Longitudinal) and Sideways (Lateral) vectors relative to car facing
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        
        const vForward = p.vx * cos + p.vy * sin;
        const vLateral = -p.vx * sin + p.vy * cos;
        
        // Calculate Slip Angle (how sideways are we moving?)
        const slipRatio = Math.abs(vLateral) / (Math.abs(vForward) + 1);
        
        // Drift Thresholds
        const driftThreshold = 0.3;
        p.isDrifting = slipRatio > driftThreshold && currentSpeed > 8;

        // Friction Constants
        // Forward friction (Air resistance + Rolling resistance)
        const fFwd = p.isBoosting ? 0.99 : 0.96; 
        
        // Lateral friction (Grip)
        // If drifting, grip drops significantly (sliding)
        // If not drifting, grip is high (car goes where it faces)
        const fLat = p.isDrifting ? 0.94 : 0.85; 

        let newVForward = vForward * fFwd;
        let newVLateral = vLateral * fLat;
        
        // Recompose velocity
        p.vx = newVForward * cos - newVLateral * sin;
        p.vy = newVForward * sin + newVLateral * cos;

        // Visuals for Drift
        if (p.isDrifting) {
             p.driftTimer += dt;
             
             // Drift Level Colors
             let driftColor = '#cccccc'; // Level 0 (Smoke)
             let driftLevel = 0;
             if (p.driftTimer > 180) { driftColor = '#aa00ff'; driftLevel = 3; } // Purple
             else if (p.driftTimer > 120) { driftColor = '#ff4400'; driftLevel = 2; } // Red/Orange
             else if (p.driftTimer > 60) { driftColor = '#00aaff'; driftLevel = 1; } // Blue

             if (Math.random() < 0.4) { 
                const rearX = p.x - cos * (stats.length/2); 
                const rearY = p.y - sin * (stats.length/2); 
                const widthOffset = stats.width / 2 - 2;
                
                // Skid Marks
                s.groundDecals.push({ x: rearX + sin * widthOffset, y: rearY - cos * widthOffset, scale: 1.0, color: '#111', alpha: 0.2, life: 300, maxLife: 300, rotation: p.angle, type: 'skid' });
                s.groundDecals.push({ x: rearX - sin * widthOffset, y: rearY + cos * widthOffset, scale: 1.0, color: '#111', alpha: 0.2, life: 300, maxLife: 300, rotation: p.angle, type: 'skid' });

                // Smoke - Enhanced for better visibility
                if (Math.random() < 0.8) { 
                    s.particles.push({ 
                        x: rearX + (Math.random()-0.5)*20, 
                        y: rearY + (Math.random()-0.5)*20, 
                        vx: p.vx * 0.1 + (Math.random()-0.5)*5, 
                        vy: p.vy * 0.1 + (Math.random()-0.5)*5, 
                        life: 40 + Math.random()*30, 
                        maxLife: 70, 
                        color: 'rgba(220,220,220,0.4)', 
                        size: 8 + Math.random()*8, 
                        type: 'smoke',
                        rotation: Math.random() * Math.PI * 2,
                        rotationSpeed: (Math.random() - 0.5) * 0.1
                    });
                }
                
                // Drift Sparks (Level 1+)
                if (driftLevel > 0 && Math.random() < 0.5) {
                    for(let i=0; i<driftLevel; i++) {
                        s.particles.push({
                            x: rearX + (Math.random()-0.5)*widthOffset*2,
                            y: rearY + (Math.random()-0.5)*10,
                            vx: -cos * 10 + (Math.random()-0.5)*10,
                            vy: -sin * 10 + (Math.random()-0.5)*10,
                            life: 20 + Math.random()*10,
                            maxLife: 30,
                            color: driftColor,
                            size: 3 + Math.random()*3,
                            type: 'spark'
                        });
                    }
                }
            } 
        } else {
            // End Drift - Apply Boost if earned
            if (p.driftTimer > 60) {
                let boostPower = 0;
                if (p.driftTimer > 180) boostPower = 40; // Purple Boost
                else if (p.driftTimer > 120) boostPower = 25; // Red Boost
                else if (p.driftTimer > 60) boostPower = 15; // Blue Boost
                
                // Apply forward boost
                const boostAngle = p.angle;
                p.vx += Math.cos(boostAngle) * boostPower;
                p.vy += Math.sin(boostAngle) * boostPower;
                
                // Visual Flash
                s.particles.push({
                    x: p.x, y: p.y, vx: 0, vy: 0, life: 20, maxLife: 20, 
                    color: p.driftTimer > 180 ? '#aa00ff' : (p.driftTimer > 120 ? '#ff4400' : '#00aaff'), 
                    size: 100, type: 'shockwave'
                });
                
                // Sound/Text Effect (Optional)
                s.damageTexts.push({
                    x: p.x, y: p.y - 50, value: 0, life: 60, 
                    color: p.driftTimer > 180 ? '#aa00ff' : (p.driftTimer > 120 ? '#ff4400' : '#00aaff'),
                    velocityY: -2, scale: 1.5
                });
            }
            p.driftTimer = 0;
        }
    } else {
        // Simple friction when stopped/airborne
        const drag = p.z > 0 ? 0.99 : 0.95;
        p.vx *= drag;
        p.vy *= drag;
        p.isDrifting = false;
    }

    // --- AUDIO UPDATES ---
    const isLocalPlayer = p.id === (s.isSpectating ? s.camera.spectateTargetId : 'player');
    audioService.updateEngineSound(p.id, stats, p.x, p.y, s.camera.x, s.camera.y, currentSpeed, isLocalPlayer);
    audioService.updateNitroSound(p.id, p.x, p.y, s.camera.x, s.camera.y, p.isBoosting, isLocalPlayer);
    audioService.updateSkidSound(p.id, p.x, p.y, s.camera.x, s.camera.y, p.isDrifting, isLocalPlayer);
    
    // --- WHEEL ROTATION LOGIC ---
    if (p.z === 0) {
        const forwardX = Math.cos(p.angle);
        const forwardY = Math.sin(p.angle);
        const dot = p.vx * forwardX + p.vy * forwardY;
        const dir = dot > 0 ? 1 : -1;
        p.wheelAngle += currentSpeed * dir * 0.15 * dt;
    }

    if (currentSpeed > maxSpd && p.z === 0) { const scale = maxSpd / currentSpeed; p.vx *= scale; p.vy *= scale; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.hypot(p.x, p.y) + 30 > s.currentArenaRadius) { const ang = Math.atan2(p.y, p.x); p.x = Math.cos(ang) * (s.currentArenaRadius - 30); p.y = Math.sin(ang) * (s.currentArenaRadius - 30); p.vx *= -0.5; p.vy *= -0.5; }
    if (p.z === 0) updateTrail(p, s, dt);
    const turretActive = Math.abs(aimX) > 0.1 || Math.abs(aimY) > 0.1;
    let finalTargetAngle = p.turretAngle; // Store for shooting check

    if (turretActive) { 
        let targetAngle = p.id === 'player' && s.input.aimSource === 'touch' ? Math.atan2(-aimY, -aimX) : Math.atan2(aimY, aimX); 
        
        let diff = targetAngle - p.turretAngle; while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2; 
        const turnSpeed = p.id === 'player' ? Infinity : 0.1; // INSTANT TURNING for player
        if (turnSpeed === Infinity) p.turretAngle = targetAngle;
        else p.turretAngle += diff * turnSpeed * dt; 
        
        finalTargetAngle = targetAngle;
    }
    
    // --- SHOOTING & CHARGING LOGIC ---
    const isTank = stats.name === "TITAN";
    let shouldFire = false;
    let chargeMultiplier = 1.0;

    if (isTank && p.id === 'player') {
        if (isShooting && turretActive && p.z === 0 && !p.isStealth) {
            p.chargeLevel = Math.min(100, p.chargeLevel + 1.2 * dt);
            // Visual charging effect
            if (p.chargeLevel > 20 && Math.random() < 0.3) {
                const cos = Math.cos(p.turretAngle); const sin = Math.sin(p.turretAngle);
                const bx = p.x + 45 * cos; const by = p.y + 45 * sin;
                spawnParticles(s, bx, by, 1, getSkin(p.skinIndex).glowColor, 2, 'spark');
            }
            shouldFire = false; // Don't fire while charging
        } else if (p.chargeLevel > 5) {
            shouldFire = true;
            chargeMultiplier = 1.0 + (p.chargeLevel / 100) * 2.5; // Up to 3.5x damage
            p.chargeLevel = 0;
        } else {
            p.chargeLevel = 0;
            shouldFire = false;
        }
    } else {
        shouldFire = isShooting && turretActive && p.z === 0 && !p.isStealth;
    }

    if (shouldFire) {
        // Use finalTargetAngle (which includes auto-aim) for alignment check
        let angleDiff = finalTargetAngle - p.turretAngle; 
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2; while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        
        // Relaxed alignment check for player to feel more responsive
        const alignmentThreshold = p.id === 'player' ? 0.8 : 0.3; // Very generous 45 degree cone
        const isAligned = Math.abs(angleDiff) < alignmentThreshold; 
        
        if (isAligned) {
            if (p.ammo > 0 && p.reloadTimer <= 0) {
                const now = performance.now(); 
                let fireDelay = p.statFireRate * 16.6;
                if (p.activePower === 'RAPID') fireDelay /= 3;

                // For Tank, the charge time IS the delay, but we still check lastShot for safety
                if (now - p.lastShot > (isTank ? 200 : fireDelay)) {
                    p.lastShot = now; 
                    const isLocalPlayer = p.id === (s.isSpectating ? s.camera.spectateTargetId : 'player');
                    audioService.playShootSound(stats, isLocalPlayer, p.x, p.y, s.camera.x, s.camera.y, chargeMultiplier);
                    p.ammo--; if (p.ammo <= 0) p.reloadTimer = RELOAD_TIME;
                    // Use turretAngle for bullet direction so it matches visual
                    const cos = Math.cos(p.turretAngle); const sin = Math.sin(p.turretAngle); 
                    const skin = getSkin(p.skinIndex);
                    const bulletColor = skin.glowColor;
                    
                    // Power Up Modifiers
                    let damage = p.statDamage * chargeMultiplier;
                    if (p.activePower === 'DAMAGE') damage *= 2;
                    
                    const firePoints: {f: number, s: number}[] = [];
                    if (stats.name === "VOLTAGE") { firePoints.push({ f: 20, s: -6 }); firePoints.push({ f: 20, s: 6 }); } 
                    else if (stats.name === "NOVA") { firePoints.push({ f: 25, s: -12 }); firePoints.push({ f: 25, s: 12 }); }
                    else if (stats.name === "EAGLE") { firePoints.push({ f: 55, s: 0 }); } 
                    else if (stats.name === "TITAN") { firePoints.push({ f: 35, s: 0 }); } 
                    else if (stats.name === "PHANTOM") { firePoints.push({ f: 35, s: 0 }); } 
                    else if (stats.name === "REI DO INFERNO") { firePoints.push({ f: 30, s: 0 }); } 
                    else { firePoints.push({ f: 25, s: 0 }); }

                    firePoints.forEach(pt => {
                        const bx = p.x + pt.f * cos - pt.s * sin; const by = p.y + pt.f * sin + pt.s * cos;
                        
                        // UNIQUE PROJECTILE LOGIC
                        let bSpeed = stats.bulletSpeed;
                        let bSize = stats.bulletSize;
                        let bLife = 60;
                        let bColor = bulletColor;
                        let bType = 'STANDARD'; // New property for draw logic

                        if (stats.name === "VOLTAGE") {
                            bSpeed *= 1.5; bSize = 1.5; bType = 'LIGHTNING'; // Drastically reduced
                        } else if (stats.name === "TITAN") {
                            bSpeed *= 0.8; 
                            // More aggressive size scaling: starts at 0.5x, goes up to ~2.5x base size
                            bSize = stats.bulletSize * 0.5 * (1 + (chargeMultiplier - 1) * 1.5); 
                            bLife = 80; bType = 'HEAVY'; 
                            if (chargeMultiplier > 2) {
                                triggerShake(0.3 * chargeMultiplier);
                                spawnParticles(s, bx, by, 15, skin.glowColor, 5, 'spark');
                                s.particles.push({
                                    x: bx, y: by, vx: 0, vy: 0, life: 20, maxLife: 20,
                                    color: skin.glowColor, size: 100 * chargeMultiplier, type: 'shockwave'
                                });
                            }
                        } else if (stats.name === "VORTEX" || stats.name === "NOVA") {
                            bSize = 5; bType = 'ENERGY_BALL'; // Vortex Energy Ball (Increased size)
                        } else if (stats.name === "EAGLE") {
                            bSpeed *= 2.0; bSize = 1.0; bLife = 40; bType = 'SNIPER'; // Very thin laser
                        } else if (stats.name === "REI DO INFERNO") {
                            bSpeed *= 0.6; bSize *= 0.8; bLife = 30; bType = 'FLAME'; // Smaller plasma blobs
                            // Spread for flamethrower
                            const spread = (Math.random() - 0.5) * 0.3;
                            const fCos = Math.cos(p.turretAngle + spread);
                            const fSin = Math.sin(p.turretAngle + spread);
                            s.bullets.push({ 
                                x: bx, y: by, vx: fCos * bSpeed, vy: fSin * bSpeed, 
                                life: bLife, color: '#ff5500', ownerId: p.id, ownerTeamId: p.teamId, ownerName: p.name || 'UNKNOWN', 
                                size: bSize, damage: damage, bounces: false, bounceCount: 0,
                                projectileCoreColor: '#ffff00'
                            });
                            return; // Skip default push
                        } else if (stats.name === "PHANTOM") {
                            bType = 'GHOST';
                        }

                        s.bullets.push({ 
                            x: bx, y: by, vx: cos * bSpeed, vy: sin * bSpeed, 
                            life: bLife, color: bColor, ownerId: p.id, ownerTeamId: p.teamId, ownerName: p.name || 'UNKNOWN', 
                            size: bSize, damage: damage, bounces: stats.ability === 'jump', bounceCount: 0,
                            projectileCoreColor: skin.projectileColor?.core,
                            bType: bType // Pass the type!
                        });

                        if (p.id === 'player' && s.gameMode === 'MULTIPLAYER') {
                            multiplayerService.shoot({
                                x: bx, y: by, vx: cos * bSpeed, vy: sin * bSpeed,
                                damage: damage, life: bLife, bType: bType, color: bColor,
                                size: bSize, bounces: stats.ability === 'jump',
                                projectileCoreColor: skin.projectileColor?.core,
                                chargeMultiplier: chargeMultiplier
                            });
                        }
                        
                        // Muzzle Flash Particles
                        if (stats.name === "REI DO INFERNO") {
                             // Flamethrower uses continuous flame, no discrete flash/shell
                        } else if (stats.name === "VOLTAGE" || stats.name === "NOVA") {
                             // Energy weapons: Plasma burst, no shells
                             spawnParticles(s, bx, by, 5, skin.glowColor, 3, 'spark');
                             s.particles.push({
                                 x: bx, y: by, vx: 0, vy: 0, life: 15, maxLife: 15,
                                 color: skin.glowColor, size: 20, type: 'shockwave'
                             });
                        } else if (stats.name === "EAGLE") {
                             // Sniper: High velocity ring and smoke
                             spawnParticles(s, bx, by, 3, '#fff', 2, 'spark');
                             s.particles.push({
                                 x: bx, y: by, vx: cos * 5, vy: sin * 5, life: 20, maxLife: 20,
                                 color: '#fff', size: 30, type: 'shockwave'
                             });
                             // Smoke puff
                             s.particles.push({
                                 x: bx, y: by, vx: cos * 2, vy: sin * 2, life: 40, maxLife: 40,
                                 color: 'rgba(200,200,200,0.5)', size: 15, type: 'smoke'
                             });
                             // Shell Ejection (Large Sniper Casing)
                             const sx = bx - cos * 30; const sy = by - sin * 30;
                             const ejectDir = (Math.random() > 0.5 ? 1 : -1);
                             const shellAngle = p.turretAngle + Math.PI/2 * ejectDir;
                             s.particles.push({
                                 x: sx, y: sy, z: 16, vz: 10 + Math.random() * 4,
                                 vx: p.vx * 0.5 + Math.cos(shellAngle) * 8, 
                                 vy: p.vy * 0.5 + Math.sin(shellAngle) * 8,
                                 life: 300, maxLife: 300, color: '#d4af37', size: 9, type: 'shell',
                                 rotation: Math.random() * Math.PI, rotationSpeed: (Math.random() - 0.5) * 0.5
                             });
                        } else if (stats.name === "TITAN") {
                             // Heavy Cannon: Massive flash, smoke, huge shells
                             spawnParticles(s, bx, by, 8, '#ffaa00', 4, 'spark');
                             s.particles.push({
                                 x: bx, y: by, vx: cos * 3, vy: sin * 3, life: 30, maxLife: 30,
                                 color: 'rgba(100,100,100,0.6)', size: 25, type: 'smoke'
                             });
                             // Shell Ejection (Massive Casing)
                             const sx = bx - cos * 20; const sy = by - sin * 20;
                             const ejectDir = (Math.random() > 0.5 ? 1 : -1);
                             const shellAngle = p.turretAngle + Math.PI/2 * ejectDir + (Math.random()-0.5)*0.2;
                             s.particles.push({
                                 x: sx, y: sy, z: 18, vz: 12 + Math.random() * 5,
                                 vx: p.vx * 0.5 + Math.cos(shellAngle) * 6, 
                                 vy: p.vy * 0.5 + Math.sin(shellAngle) * 6,
                                 life: 400, maxLife: 400, color: '#b8860b', size: 12, type: 'shell',
                                 rotation: Math.random() * Math.PI, rotationSpeed: (Math.random() - 0.5) * 0.8
                             });
                        } else {
                             // Standard weapons
                             spawnParticles(s, bx, by, 3, '#fff', 2, 'spark');
                             
                             // SHELL EJECTION (Cinematic Breech Ejection)
                             const breechOffset = 25;
                             const sx = bx - cos * breechOffset;
                             const sy = by - sin * breechOffset;
                             
                             const ejectDir = (Math.random() > 0.5 ? 1 : -1);
                             const shellAngle = p.turretAngle + Math.PI/2 * ejectDir + (Math.random()-0.5)*0.5;
                             const shellSpeed = 6 + Math.random() * 4;
                             
                             s.particles.push({
                                 x: sx, y: sy, 
                                 z: 16, vz: 14 + Math.random() * 6,
                                 vx: p.vx * 0.8 + Math.cos(shellAngle) * shellSpeed, 
                                 vy: p.vy * 0.8 + Math.sin(shellAngle) * shellSpeed,
                                 life: 300, maxLife: 300, 
                                 color: '#d4af37', 
                                 size: 7, type: 'shell',
                                 rotation: Math.random() * Math.PI,
                                 rotationSpeed: (Math.random() - 0.5) * 1.0
                             });
                        }
                    });
                    p.muzzleFlashTimer = 4;
                }
            } else if (p.ammo <= 0 && p.reloadTimer <= 0) { p.reloadTimer = RELOAD_TIME; }
        }
    }
  };

  const updateTrail = (p: CarEntity, s: GameState, dt: number) => {
    if (p.z > 0) return; // No trails when airborne
    if (Math.abs(p.vx) < 2 && Math.abs(p.vy) < 2) return;
    const stats = getCarStats(p.typeIndex);
    const skin = getSkin(p.skinIndex);
    const wheelX = stats.length / 2 - 8; const wheelY = stats.width / 2 + 2;
    const wheelOffsets = [{ x: wheelX, y: -wheelY }, { x: wheelX, y: wheelY }, { x: -wheelX + 5, y: -wheelY }, { x: -wheelX + 5, y: wheelY }];
    if (!p.visualTrails || p.visualTrails.length !== 4) p.visualTrails = [[], [], [], []];
    
    wheelOffsets.forEach((o, idx) => {
        const wx = p.x + (o.x * Math.cos(p.angle) - o.y * Math.sin(p.angle)); const wy = p.y + (o.x * Math.sin(p.angle) + o.y * Math.cos(p.angle));
        const currentTrail = p.visualTrails[idx]; const lastPoint = currentTrail.length > 0 ? currentTrail[currentTrail.length - 1] : null;
        if (!lastPoint || Math.hypot(wx - lastPoint.x, wy - lastPoint.y) > TRAIL_SPACING) { 
            currentTrail.push({ x: wx, y: wy, color: skin.glowColor, alpha: 1.0 }); 
            if (currentTrail.length > 40) currentTrail.shift(); 
            
            // Special Trail Effects
            if (skin.trailType === 'MATRIX') {
                 if (Math.random() < 0.2) {
                     s.particles.push({ 
                         x: wx, y: wy, vx: 0, vy: -0.5, life: 60, maxLife: 60, color: '#00ff00', size: 12, type: 'matrix_char', char: Math.random() > 0.5 ? '1' : '0' 
                     });
                 }
            }
            if (stats.name === "REI DO INFERNO") {
                 if (Math.random() < 0.6) {
                     s.particles.push({ 
                         x: wx + (Math.random()-0.5)*10, y: wy + (Math.random()-0.5)*10, 
                         vx: 0, vy: -1, life: 30 + Math.random()*20, maxLife: 50, 
                         color: Math.random() > 0.5 ? '#ff4400' : '#ffaa00', 
                         size: 6 + Math.random()*6, type: 'fire' 
                     });
                 }
            }
        }
    });
    
    // REI DO INFERNO specific body fire
    if (stats.name === "REI DO INFERNO" && Math.random() < 0.3) {
        s.particles.push({
            x: p.x + (Math.random()-0.5)*stats.length,
            y: p.y + (Math.random()-0.5)*stats.width,
            vx: p.vx * 0.5, vy: p.vy * 0.5 - 2,
            life: 40, maxLife: 40, color: '#ff5500', size: 8 + Math.random()*8, type: 'fire'
        });
    }
  };

  const takeDamage = (p: CarEntity, amount: number, s: GameState, attacker?: CarEntity) => { 
      if (p.isDead) return;
      
      if (p.activePower === 'SHIELD') {
          s.damageTexts.push({ x: p.x, y: p.y - 20, value: 0, life: 30, color: '#ffff00', velocityY: 1, scale: 1 });
          spawnParticles(s, p.x, p.y, 5, '#ffd700', 2, 'spark');
          return;
      }
      
      const stats = getCarStats(p.typeIndex);
      let finalDamage = amount;
      let isCritical = false;

      // 1. Defense Reduction
      finalDamage *= (1 - stats.baseDefense);

      // 2. Critical Hit (Rear Impact) & Proximity Scaling
      if (attacker) {
          // Proximity Damage Scaling: Closer = More Damage
          const dist = Math.hypot(p.x - attacker.x, p.y - attacker.y);
          // Scale from 1.0x at 800px distance to 1.5x at 0px distance
          const proximityMult = 1 + Math.max(0, (800 - dist) / 800) * 0.5;
          finalDamage *= proximityMult;

          const angleToAttacker = Math.atan2(attacker.y - p.y, attacker.x - p.x);
          // Car facing angle
          const facingX = Math.cos(p.angle);
          const facingY = Math.sin(p.angle);
          // Vector to attacker
          const toAttackerX = Math.cos(angleToAttacker);
          const toAttackerY = Math.sin(angleToAttacker);
          
          // Dot product: if negative, attacker is behind (roughly)
          // Actually, if car is facing AWAY from attacker, it's a rear hit.
          // Dot product of Facing vs ToAttacker. 
          // If they are roughly same direction (dot > 0), attacker is in front.
          // If dot < 0, attacker is behind.
          // Wait, vector TO attacker. 
          // If I face North (0,-1), and attacker is South (0,1). Dot is -1. Rear hit.
          const dot = facingX * toAttackerX + facingY * toAttackerY;
          
          if (dot < -0.5) { // Rear hit
              isCritical = true;
              finalDamage *= 1.2; // Reduced from 1.5 to prevent instant kills
          }
      }
      
      if (isNaN(finalDamage)) finalDamage = 0;
      p.health -= finalDamage;
      audioService.playImpactSound(p.x, p.y, s.camera.x, s.camera.y, finalDamage / 20, isCritical);
      
      // Visuals
      const isHeavyHit = finalDamage > 15;
      const textColor = isCritical ? '#ff00ff' : (isHeavyHit ? '#ff0000' : '#ffffff');
      const textScale = isCritical ? 2.0 : (isHeavyHit ? 1.5 : 1.0);
      const textVal = Math.ceil(finalDamage);
      
      s.damageTexts.push({
          x: p.x, y: p.y, value: textVal, life: 60, 
          color: textColor,
          velocityY: 2 + Math.random() * 2, scale: textScale * 1.5 // Increased scale by 50%
      });
      
      if (isCritical) {
          spawnParticles(s, p.x, p.y, 10, '#ff00ff', 3, 'spark');
          s.groundDecals.push({ x: p.x, y: p.y, scale: 0.8, color: '#330000', alpha: 0.5, life: 100, maxLife: 100, rotation: Math.random()*6, type: 'splatter' });
      }

      if (p.health <= 0) { p.health = 0; killEntity(p, s, attacker); } 
      
      // Low Health Smoke
      if (p.health < p.maxHealth * 0.3 && Math.random() < 0.1) {
           s.particles.push({ x: p.x, y: p.y, vx: 0, vy: -2, life: 40, maxLife: 40, color: '#555', size: 10, type: 'smoke' });
      }
  };

  const killEntity = (p: CarEntity, s: GameState, killer?: CarEntity, killerNameOverride?: string) => {
    if(p.isDead) return;
    const isLocalPlayer = p.id === (s.isSpectating ? s.camera.spectateTargetId : 'player');
    audioService.playExplosion(p.x, p.y, s.camera.x, s.camera.y, isLocalPlayer ? 1.5 : 1.0);
    audioService.stopAllEntitySounds(p.id);
    
    p.killerId = killer ? killer.id : (killerNameOverride || "SUICIDE");
    const skin = getSkin(p.skinIndex); const killerNameStr = killerNameOverride || (killer ? killer.name : "SUICIDE");
    s.killLog.push({ id: `kill_${performance.now()}`, text: `${killerNameStr} 💀 ${p.name}`, life: 180 });
    
    if (killer) {
        killer.totalKills++;
    }
    
    const isKillerLocalPlayer = killer && killer.id === (s.isSpectating ? s.camera.spectateTargetId : 'player');
    if (isKillerLocalPlayer) {
        audioService.playKillSound();
        const now = performance.now(); const timeSinceLast = now - killer.lastKillTime; 
        if (killer.id === 'player') setUserProfile(prev => ({...prev, totalKills: prev.totalKills + 1}));
        if (timeSinceLast < 3000) { killer.killStreak++; } else { killer.killStreak = 1; } killer.lastKillTime = now;
        if (killer.killStreak >= 2) { let text = ""; if (killer.killStreak === 2) text = "DOUBLE CRASH"; else if (killer.killStreak === 3) text = "SYSTEM OVERLOAD"; else if (killer.killStreak === 4) text = "RAMPAGE"; else text = "GODLIKE"; s.announcement = { text: text, subText: `${killer.killStreak} KILLS`, life: 120, scale: 1.0, color: killer.killStreak > 3 ? '#ff0000' : '#ffff00' }; triggerShake(0.5); }
    }
    const scoreToDrop = Math.floor(p.score * 0.5); const dropCount = Math.min(20, Math.max(3, Math.floor(scoreToDrop / 2))); const valPerOrb = Math.max(1, Math.floor(scoreToDrop / dropCount));
    for(let i=0; i<dropCount; i++) { const angle = Math.random() * Math.PI * 2; const speed = 2 + Math.random() * 8; s.orbs.push({ id: `drop_${p.id}_${i}_${performance.now()}`, x: p.x, y: p.y, value: valPerOrb, color: skin.glowColor, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, animOffset: Math.random() * 100, life: 2000, isMapOrb: false, powerType: 'NONE' }); }
    
    spawnParticles(s, p.x, p.y, 100, skin.colors[0], 6, 'fluid'); 
    spawnParticles(s, p.x, p.y, 60, '#ffaa00', 5, 'fire'); 
    spawnParticles(s, p.x, p.y, 40, '#ffffff', 8, 'spark'); 
    spawnParticles(s, p.x, p.y, 20, '#333333', 3, 'smoke'); 
    
    s.deadSpots.push({ x: p.x, y: p.y, life: 1000 }); s.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 30, maxLife: 30, color: skin.glowColor, size: 20, type: 'shockwave' }); s.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 20, maxLife: 20, color: '#ff5500', size: 80, type: 'shockwave' }); s.groundDecals.push({ x: p.x, y: p.y, scale: 1.5, color: '#110500', alpha: 0.8, life: 5000, maxLife: 5000, rotation: Math.random()*6, type: 'scorch' }); triggerShake(0.6); p.isDead = true; p.respawnTimer = RESPAWN_FRAMES;
  };
  const spawnPowerUp = (s: GameState) => {
      const types: PowerUpType[] = ['DAMAGE', 'SHIELD', 'RAPID', 'GHOST'];
      const type = types[Math.floor(Math.random() * types.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (s.currentArenaRadius * 0.8);
      s.orbs.push({
          id: `power_${performance.now()}`,
          x: Math.cos(angle) * dist, y: Math.sin(angle) * dist,
          value: 0, color: POWER_COLORS[type],
          vx: 0, vy: 0, animOffset: Math.random() * 100,
          life: 999999, isMapOrb: true,
          powerType: type
      });
  };

  const applyPowerUp = (p: CarEntity, type: PowerUpType, s: GameState) => {
      p.activePower = type;
      p.powerTimer = POWER_DURATIONS[type];
      
      // Cinematic Pickup Effect
      spawnParticles(s, p.x, p.y, 30, POWER_COLORS[type], 4, 'shockwave');
      spawnParticles(s, p.x, p.y, 20, '#ffffff', 5, 'spark');
      
      // Floating Text
      s.damageTexts.push({
          x: p.x, y: p.y - 50,
          value: 0, // Hack to use damage text logic
          life: 120,
          color: POWER_COLORS[type],
          velocityY: 1,
          scale: 1.5
      });
      
      if (p.id === 'player') {
          s.announcement = { text: type.replace('_', ' '), subText: "SYSTEM UPGRADE", life: 120, scale: 1.2, color: POWER_COLORS[type] };
      }
  };

  const spawnParticles = (s: GameState, x: number, y: number, count: number, color: string, speedMult = 1, type: Particle['type'] = 'spark') => { for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 4 * speedMult; s.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 20 + Math.random() * 20, maxLife: 40, color, size: 2 + Math.random() * 4, type }); } };

  // --- Drawing ---
  const drawMenu = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const s = state.current; const time = performance.now();
    
    // 1. Dynamic Background (Gray/Slate)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height); 
    bgGrad.addColorStop(0, '#1e293b'); // Slate 800
    bgGrad.addColorStop(1, '#0f172a'); // Slate 900
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    // Apply Cinematic Camera Interpolation
    const camZoom = s.menu.cameraZoom;
    const camY = s.menu.cameraYOffset;
    
    // Smooth Transition using transitionProgress
    const t = s.menu.transitionProgress;
    const startY = height * 0.52; 
    const endY = height * 0.35;
    const targetY = startY + (endY - startY) * t;
    
    ctx.translate(width/2, targetY + camY);
    // Slightly more perspective (0.4 instead of 0.3)
    ctx.scale(1 * camZoom, 0.4 * camZoom); 
    
    // 2. Scrolling Grid (Driving Upwards -> Grid moves Down)
    const gridSize = 150;
    const scrollSpeed = 0.4; // Faster speed
    const scrollOffset = (time * scrollSpeed) % gridSize;
    const gridCount = 20;
    const gridWidth = gridCount * gridSize;
    
    // Fade out edges
    const gridGrad = ctx.createRadialGradient(0, 0, 100, 0, 0, gridWidth * 0.8);
    gridGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    gridGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = gridGrad;
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    
    // Vertical Lines (Fixed)
    for (let i = -gridCount; i <= gridCount; i++) {
        ctx.moveTo(i * gridSize, -gridWidth); 
        ctx.lineTo(i * gridSize, gridWidth);
    }
    
    // Horizontal Lines (Scrolling Downwards)
    for (let i = -gridCount; i <= gridCount; i++) {
        const y = i * gridSize + scrollOffset;
        if (y > -gridWidth && y < gridWidth) {
             ctx.moveTo(-gridWidth, y);
             ctx.lineTo(gridWidth, y);
        }
    }
    ctx.stroke();
    
    // 3. Speed Lines (Moving Downwards)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<40; i++) {
        const seed = i * 9999;
        const x = ((seed + i * 50) % (gridWidth * 2)) - gridWidth;
        const speedOffset = (time * (0.5 + (i%5)*0.1)) % (height * 3);
        const y = -height + speedOffset;
        const len = 100 + (i%10)*20;
        
        if (y < height) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - len);
        }
    }
    ctx.stroke();
    
    ctx.restore();

    // Render Hero Car
    const cx = width / 2; 
    const cy = targetY + camY; 
    
    // Smooth Scale Transition
    const startScale = 3.5;
    const endScale = 2.5;
    const baseScale = startScale + (endScale - startScale) * t;
    
    // Dynamic Scale Adjustment for Teams
    let teamScaleModifier = 1.0;
    if (teammates.length > 0) {
        if (width < 768) {
            // Mobile
            teamScaleModifier = teammates.length === 1 ? 0.7 : (teammates.length === 2 ? 0.6 : 0.5);
        } else {
            // Desktop
            teamScaleModifier = teammates.length === 1 ? 0.85 : (teammates.length === 2 ? 0.75 : 0.65);
        }
    }
    
    const heroScale = baseScale * camZoom * teamScaleModifier; 
    
    ctx.save();
    // Shift Hero slightly left if in team mode to balance composition?
    // Actually, center is fine if we distribute teammates around.
    // But if we have 1 teammate (Duo), usually Hero is Left, Teammate is Right?
    // Current logic: Hero Center, Teammate Right (+spacing).
    // This makes the group off-center.
    
    let groupOffsetX = 0;
    const baseSpacing = 300 * teamScaleModifier; // Increased from 220 to 300 for better spacing
    
    if (teammates.length === 1) groupOffsetX = -baseSpacing / 2;
    else if (teammates.length === 2) groupOffsetX = 0; // Hero Center, Left/Right
    else if (teammates.length === 3) groupOffsetX = -baseSpacing / 2; // Hero Left-Center (-0.5)

    ctx.translate(cx + groupOffsetX, cy);
    ctx.scale(heroScale, heroScale);
    
    const menuCar = createCar(`menu_hero`, selectedCarType, selectedSkinIndex, 0, 0, 0);
    // Driving Upwards (Fixed Angle)
    menuCar.angle = -Math.PI/2; 
    // Subtle steering wobble
    menuCar.angle += Math.sin(time * 0.002) * 0.05;
    
    menuCar.turretAngle = menuCar.angle + Math.sin(time * 0.001) * 0.1;
    menuCar.wheelAngle = time * 0.05; // Fast wheel spin
    
    // Light Trail (Downwards)
    const skin = getSkin(selectedSkinIndex);
    const trailColor = skin.glowColor;
    
    // Draw Trail
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const trailGrad = ctx.createLinearGradient(0, 0, 0, 200);
    trailGrad.addColorStop(0, addAlphaToColor(trailColor, '88'));
    trailGrad.addColorStop(1, 'transparent');
    
    ctx.fillStyle = trailGrad;
    // Trapezoid trail shape
    ctx.beginPath();
    ctx.moveTo(-15, 20); // Rear Left
    ctx.lineTo(15, 20);  // Rear Right
    ctx.lineTo(25, 200); // Trail End Right
    ctx.lineTo(-25, 200); // Trail End Left
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    drawEntity(ctx, menuCar, true); 
    
    // Player Name Tag
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(playerName || "DRIVER", 0, 80);
    
    ctx.restore();

    // Render Teammates (if any)
    if (!isPlaying && teammates.length > 0) {
        teammates.forEach((tm, i) => {
            // Even if tm is null (empty slot), we might want to render a placeholder or just the slot UI handles it?
            // The slot UI (React) handles the "+" button.
            // Here we only render actual cars.
            if (!tm) return;
            
            let offsetX = 0;
            // Re-calculate offsets to match the group centering logic
            if (teammates.length === 1) {
                // Duo: Hero @ -0.5, TM @ +0.5
                offsetX = baseSpacing; 
            }
            else if (teammates.length === 2) {
                // Trio: TM1 @ -1, Hero @ 0, TM2 @ +1
                offsetX = (i === 0 ? -baseSpacing : baseSpacing);
            }
            else if (teammates.length === 3) {
                // Squad: TM1 @ -1.5, Hero @ -0.5, TM2 @ 0.5, TM3 @ 1.5
                // Wait, Hero is at groupOffsetX = baseSpacing/2? No.
                // Let's stick to Hero Center for odd numbers, and offset for even.
                // Squad (4): -1.5, -0.5, 0.5, 1.5
                // Hero is one of them.
                // Let's keep Hero at Center (0) relative to group center.
                // If 4 cars: -1.5s, -0.5s, 0.5s, 1.5s.
                // Hero is usually the leader.
                // Let's put Hero at -0.5s (Left Center) or 0?
                // Simple: Hero is always 0. Teammates are relative.
                // Duo: Hero 0, TM 1. (Offset group by -0.5) -> Hero -0.5, TM 0.5.
                // Trio: TM1 -1, Hero 0, TM2 1. (Offset 0).
                // Squad: TM1 -1.5, Hero -0.5, TM2 0.5, TM3 1.5. (Offset group by +0.5?)
                // Let's use the logic:
                // i=0: -baseSpacing
                // i=1: baseSpacing
                // i=2: baseSpacing * 2 (if we keep hero at 0)
                // Then groupOffset adjusts everything.
                
                if (i === 0) offsetX = -baseSpacing;
                if (i === 1) offsetX = baseSpacing;
                if (i === 2) offsetX = baseSpacing * 2;
                
                // If we want balanced squad:
                // TM1(-1.5), Hero(-0.5), TM2(0.5), TM3(1.5)
                // Hero is at 0 relative to draw call.
                // So we need Hero to be at -0.5 * spacing.
                // TM1 should be at -1.5 * spacing -> relative to Hero: -1.0 * spacing.
                // TM2 should be at 0.5 * spacing -> relative to Hero: +1.0 * spacing.
                // TM3 should be at 1.5 * spacing -> relative to Hero: +2.0 * spacing.
                
                // So:
                // i=0 (TM1): -baseSpacing
                // i=1 (TM2): baseSpacing
                // i=2 (TM3): baseSpacing * 2
                // And groupOffsetX = -baseSpacing / 2.
                // Hero is at -0.5.
                // TM1 is at -0.5 - 1 = -1.5.
                // TM2 is at -0.5 + 1 = 0.5.
                // TM3 is at -0.5 + 2 = 1.5.
                // Perfect.
            }

            ctx.save();
            ctx.translate(cx + groupOffsetX + offsetX, cy + 50 * teamScaleModifier); 
            const tmScale = heroScale * 0.9; 
            ctx.scale(tmScale, tmScale);
            
            const tmCar = createCar(`menu_tm_${i}`, tm.carIndex, tm.skinIndex, 0, 0, 0);
            
            // Driving Upwards
            tmCar.angle = -Math.PI/2;
            // Independent wobble
            tmCar.angle += Math.sin(time * 0.002 + i) * 0.05;
            
            tmCar.turretAngle = tmCar.angle;
            tmCar.wheelAngle = time * 0.05;
            
            // Teammate Trail
            const tmSkin = getSkin(tm.skinIndex);
            const tmTrailColor = tmSkin.glowColor;
            
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const tmTrailGrad = ctx.createLinearGradient(0, 0, 0, 200);
            tmTrailGrad.addColorStop(0, addAlphaToColor(tmTrailColor, '88'));
            tmTrailGrad.addColorStop(1, 'transparent');
            
            ctx.fillStyle = tmTrailGrad;
            ctx.beginPath();
            ctx.moveTo(-15, 20); 
            ctx.lineTo(15, 20);
            ctx.lineTo(25, 200);
            ctx.lineTo(-25, 200);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            
            // Draw shadow manually since drawEntity might expect different context
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, 0, 30, 15, tmCar.angle, 0, Math.PI*2); ctx.fill();

            drawEntity(ctx, tmCar, true);
            
            // Teammate Name Tag
            ctx.fillStyle = '#aaa';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
            ctx.fillText(tm.name, 0, 80);

            ctx.restore();
        });
    }

    // UPDATE & DRAW PARTICLES IN MENU
    // We need to manually update particles here since the main update loop is paused
    // But we must be careful not to double-update if game is running (though drawMenu is only called when !isPlaying)
    if (!isPlaying) {
        for (let j = s.particles.length - 1; j >= 0; j--) { 
            const pt = s.particles[j]; 
            // Apply scale/transform to particles to match car? 
            // No, particles are spawned in WORLD space (0,0 is car center in this context?)
            // Wait, drawEntity spawns particles at p.x, p.y.
            // In menu, p.x, p.y are 0,0.
            // So particles are at 0,0 relative to the car.
            // But we just popped the context.
            // We need to draw particles with the same transform as the car!
            
            pt.x += pt.vx * 0.5; pt.y += pt.vy * 0.5; // Slow motion in menu
            pt.life -= 1;
            if (pt.life <= 0) s.particles.splice(j, 1);
        }
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(heroScale, heroScale);
        
        s.particles.forEach(pt => {
            ctx.globalAlpha = pt.life / pt.maxLife;
            if (pt.type === 'smoke') {
                ctx.fillStyle = pt.color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
            } else if (pt.type === 'fire') {
                ctx.fillStyle = pt.color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.fillStyle = pt.color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
            }
        });
        ctx.restore();
    }

    // UI Overlay for Menu
    if (menuView === 'OVERVIEW' && !isCustomizing && !showModeSelect && !isVisualizing) {
        // Car Selector
        ctx.save();
        ctx.font = 'bold 40px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
        const carStats = getCarStats(selectedCarType);
        ctx.fillText(carStats.name, width/2, 100);
        ctx.font = '20px monospace'; ctx.fillStyle = RARITY_COLORS[carStats.rarity]; ctx.shadowColor = RARITY_COLORS[carStats.rarity];
        ctx.fillText(carStats.rarity, width/2, 130);
        ctx.restore();
        
        // Arrows
        const arrowY = height / 2;
        const pulse = 1 + Math.sin(time * 0.01) * 0.1;
        
        ctx.save();
        ctx.font = '900 80px monospace'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20; 
        ctx.shadowColor = '#00ffff';
        
        // Left Arrow
        ctx.fillStyle = '#00ffff';
        ctx.translate(80, arrowY); // Moved to left edge
        ctx.scale(pulse, pulse);
        ctx.fillText("<", 0, 0);
        ctx.restore();
        
        // Right Arrow
        ctx.save();
        ctx.font = '900 80px monospace'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20; 
        ctx.shadowColor = '#00ffff';
        ctx.fillStyle = '#00ffff';
        ctx.translate(width - 80, arrowY); // Moved to right edge
        ctx.scale(pulse, pulse);
        ctx.fillText(">", 0, 0);
        ctx.restore();
        
        // Buttons are now rendered in React overlay
    }

    // DRAW MODE SELECTION OVERLAY
    if (showModeSelect) {
        // Overlay Dim
        ctx.fillStyle = 'rgba(5, 5, 8, 0.9)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 60px monospace';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
        ctx.fillText("COMBAT PROTOCOL", width/2, 100);
        ctx.font = '20px monospace';
        ctx.fillStyle = '#aaa'; ctx.shadowBlur = 0;
        ctx.fillText("SELECT SQUAD CONFIGURATION", width/2, 140);

        const buttons = getModeButtons(width, height);
        buttons.forEach(btn => {
            ctx.save();
            ctx.translate(btn.x, btn.y);
            
            // Hover effect (simulated by pulsing opacity)
            const pulse = Math.sin(time * 0.005) * 0.1 + 0.9;
            
            // Background
            const grad = ctx.createLinearGradient(0, 0, btn.w, btn.h);
            grad.addColorStop(0, addAlphaToColor(btn.color, '22'));
            grad.addColorStop(1, addAlphaToColor(btn.color, '05'));
            ctx.fillStyle = grad;
            ctx.strokeStyle = btn.color;
            ctx.lineWidth = 2;
            
            // Card Shape
            ctx.beginPath();
            ctx.moveTo(0, 20); ctx.lineTo(20, 0);
            ctx.lineTo(btn.w, 0); ctx.lineTo(btn.w, btn.h - 20);
            ctx.lineTo(btn.w - 20, btn.h); ctx.lineTo(0, btn.h);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            // Text
            ctx.shadowBlur = 10; ctx.shadowColor = btn.color;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(btn.label, btn.w / 2, btn.h / 2);
            
            // Icon / Deco
            ctx.globalAlpha = 0.3;
            if (btn.mode === 'SOLO') { ctx.beginPath(); ctx.arc(btn.w/2, btn.h/2 - 40, 10, 0, Math.PI*2); ctx.fill(); }
            if (btn.mode === 'DUO') { ctx.beginPath(); ctx.arc(btn.w/2 - 15, btn.h/2 - 40, 8, 0, Math.PI*2); ctx.arc(btn.w/2 + 15, btn.h/2 - 40, 8, 0, Math.PI*2); ctx.fill(); }
            if (btn.mode === 'TRIO') { ctx.beginPath(); ctx.arc(btn.w/2, btn.h/2 - 50, 8, 0, Math.PI*2); ctx.arc(btn.w/2 - 15, btn.h/2 - 30, 8, 0, Math.PI*2); ctx.arc(btn.w/2 + 15, btn.h/2 - 30, 8, 0, Math.PI*2); ctx.fill(); }
            if (btn.mode === 'SQUAD') { ctx.beginPath(); ctx.rect(btn.w/2 - 20, btn.h/2 - 50, 40, 40); ctx.fill(); }
            
            ctx.restore();
        });
        
        ctx.restore();
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const s = state.current; const zoom = s.camera.zoom; const time = performance.now();
    ctx.fillStyle = COLORS.darkBg; ctx.fillRect(0, 0, width, height); ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-s.camera.x - s.camera.shakeX, -s.camera.y - s.camera.shakeY);

    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 2; const gridSize = 200; 
    const startX = Math.floor((s.camera.x - (width/zoom)/2) / gridSize) * gridSize; const startY = Math.floor((s.camera.y - (height/zoom)/2) / gridSize) * gridSize;
    const endX = startX + (width/zoom) + gridSize * 2; const endY = startY + (height/zoom) + gridSize * 2;
    ctx.beginPath(); for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); } for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); } ctx.stroke();

    const pSkin = getSkin(s.player.skinIndex); ctx.shadowBlur = 40; ctx.shadowColor = pSkin.glowColor; ctx.strokeStyle = pSkin.glowColor; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, s.currentArenaRadius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    const isVisible = (x: number, y: number, margin = RENDER_CULL_MARGIN) => { const halfW = (width / zoom) / 2 + margin; const halfH = (height / zoom) / 2 + margin; return Math.abs(x - s.camera.x) < halfW && Math.abs(y - s.camera.y) < halfH; };

    s.stations.forEach(st => {
        if(!isVisible(st.x, st.y)) return; ctx.save(); ctx.translate(st.x, st.y);
        
        const time = performance.now();
        const glowColor = st.active ? (st.occupantId ? '#ff0000' : st.color) : '#111111'; 
        const stationColor = st.active && st.occupantId ? '#ff0000' : st.color;
        const baseSize = 100; // Increased size
        
        // 1. GROUND BASE (Metallic / Tech)
        ctx.save();
        ctx.scale(1, 0.5); // Perspective scale for ground
        
        // Outer Rim
        ctx.beginPath(); ctx.arc(0, 0, baseSize, 0, Math.PI*2);
        ctx.fillStyle = '#0a0a0a'; ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.stroke();
        
        // Inner Glow Ring
        if (st.active) {
            ctx.shadowBlur = 20; ctx.shadowColor = glowColor;
            ctx.strokeStyle = glowColor; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0, 0, baseSize * 0.8, 0, Math.PI*2); ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        // Mechanical Details
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, baseSize * 0.6, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-baseSize, 0); ctx.lineTo(baseSize, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -baseSize); ctx.lineTo(0, baseSize); ctx.stroke();
        
        ctx.restore();

        // 2. 3D ENERGY PILLAR
        if (st.active) {
            const pillarHeight = 150;
            const pulse = Math.sin(time * 0.005 + st.animOffset);
            
            // Core Beam (Gradient fade up)
            const grad = ctx.createLinearGradient(0, 0, 0, -pillarHeight);
            grad.addColorStop(0, `${stationColor}88`); // Semi-transparent base
            grad.addColorStop(1, 'transparent'); // Fade to top
            
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.moveTo(-40, 0); ctx.lineTo(40, 0); // Base width
            ctx.lineTo(40 + pulse * 5, -pillarHeight); // Top width (pulsing)
            ctx.lineTo(-40 - pulse * 5, -pillarHeight);
            ctx.closePath();
            ctx.fill();
            
            // Floating Tech Rings (3D effect)
            const ringCount = 3;
            for(let i=0; i<ringCount; i++) {
                const ringY = -((time * 0.05 + i * (pillarHeight/ringCount)) % pillarHeight);
                const ringScale = 1 - (Math.abs(ringY) / pillarHeight) * 0.5; // Taper at top
                
                ctx.save();
                ctx.translate(0, ringY);
                ctx.scale(ringScale, ringScale * 0.4); // Perspective
                
                ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI*2);
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
                ctx.stroke();
                
                // Tech bits on ring
                ctx.rotate(time * 0.002 * (i%2===0 ? 1 : -1));
                ctx.fillStyle = stationColor;
                ctx.fillRect(48, -4, 8, 8);
                ctx.fillRect(-56, -4, 8, 8);
                
                ctx.restore();
            }
            
            // Top Cap / Emitter
            ctx.save();
            ctx.translate(0, -20); // Hovering slightly above ground center
            const floatY = Math.sin(time * 0.003) * 10;
            ctx.translate(0, floatY);
            
            // "Hologram" Icon
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 40px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = stationColor; ctx.shadowBlur = 20;
            ctx.fillText("+", 0, 0);
            ctx.shadowBlur = 0;
            
            if(st.occupantId) { 
                ctx.fillStyle = '#ff0000'; ctx.font = 'bold 20px monospace'; 
                ctx.fillText("OCCUPIED", 0, -60); 
                
                // Warning beams
                ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.stroke();
            }
            ctx.restore();
            
            ctx.globalCompositeOperation = 'source-over';
        } else {
            // Cooldown State
            const progress = 1 - (st.cooldownTimer / STATION_COOLDOWN);
            
            // Dimmed Base
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(0, 0, 40, 20, 0, 0, Math.PI*2); ctx.fill();
            
            // Progress Ring
            ctx.strokeStyle = '#444'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.ellipse(0, 0, 40, 20, 0, 0, Math.PI*2); ctx.stroke();
            
            ctx.strokeStyle = '#00ff00';
            ctx.beginPath(); ctx.ellipse(0, 0, 40, 20, 0, 0, Math.PI*2 * progress); ctx.stroke();
            
            ctx.fillStyle = '#666'; ctx.font = 'bold 16px monospace'; 
            ctx.textAlign = 'center'; ctx.fillText(`${Math.ceil(st.cooldownTimer/60)}s`, 0, -30);
        }
        
        ctx.restore();
    });

    s.groundDecals.forEach(d => {
        if(!isVisible(d.x, d.y)) return; ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rotation); ctx.scale(d.scale, d.scale); ctx.globalAlpha = d.alpha; ctx.fillStyle = d.color;
        if (d.type === 'splatter') { ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.arc(12, 5, 8, 0, Math.PI * 2); ctx.arc(-10, 8, 10, 0, Math.PI * 2); ctx.arc(5, -12, 6, 0, Math.PI * 2); ctx.fill(); } 
        else if (d.type === 'puddle') { ctx.beginPath(); ctx.moveTo(0, -20); ctx.bezierCurveTo(20, -25, 30, -5, 10, 20); ctx.bezierCurveTo(-10, 30, -30, 10, -20, -10); ctx.fill(); } 
        else if (d.type === 'skid') { 
            ctx.fillStyle = '#000'; 
            ctx.beginPath(); 
            ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); 
            ctx.fill(); 
        }
        else if (d.type === 'scorch') { ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = d.alpha * 0.5; ctx.beginPath(); ctx.arc(10, 10, 20, 0, Math.PI*2); ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2); ctx.fill(); } ctx.restore();
    });

    s.orbs.forEach(orb => {
        if(!isVisible(orb.x, orb.y)) return; 
        const floatY = Math.sin(time * 0.003 + orb.animOffset) * 20; 
        const rot = time * 0.002 + orb.animOffset;
        
        if (orb.powerType !== 'NONE') {
            // POWER UP VISUAL
            ctx.save(); ctx.translate(orb.x, orb.y + floatY);
            
            // Outer Ring
            ctx.strokeStyle = orb.color; ctx.lineWidth = 4;
            ctx.shadowColor = orb.color; ctx.shadowBlur = 20;
            ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.stroke();
            
            // Inner Rotation
            ctx.rotate(rot * 2);
            ctx.fillStyle = orb.color;
            ctx.fillRect(-15, -15, 30, 30);
            
            // Icon Text
            ctx.rotate(-rot * 2);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(orb.powerType[0], 0, 0);
            
            ctx.restore();
        } else {
            // STANDARD ORB
            ctx.save(); ctx.translate(orb.x, orb.y); ctx.scale(1, 0.3); ctx.fillStyle = orb.color; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(0, 0, 40 + Math.sin(time * 0.005) * 10, 0, Math.PI*2); ctx.fill(); ctx.restore(); 
            ctx.save(); ctx.translate(orb.x, orb.y - 40 + floatY); const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 60); grad.addColorStop(0, orb.color); grad.addColorStop(1, 'transparent'); ctx.fillStyle = grad; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.strokeStyle = orb.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.roundRect(-12, -25, 24, 50, 12); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.shadowColor = orb.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.roundRect(-6, -15, 12, 30, 6); ctx.fill(); ctx.shadowBlur = 0;
            ctx.rotate(rot); ctx.strokeStyle = orb.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 35, 10, 0.5, 0, Math.PI*2); ctx.stroke(); ctx.restore();
        }
    });

    const drawTrail = (p: CarEntity) => {
        if(p.isDead || p.z > 0) return; if(!isVisible(p.x, p.y)) return; ctx.lineWidth = 8; 
        p.visualTrails.forEach(t => { if(t.length < 2) return; for(let i=0; i<t.length-1; i++) { const seg = t[i]; const alpha = Math.max(0.1, (i / t.length) * 0.9); ctx.strokeStyle = seg.color; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(seg.x, seg.y); ctx.lineTo(t[i+1].x, t[i+1].y); ctx.stroke(); } }); ctx.globalAlpha = 1;
    };
    
    // Draw Standard Trails first
    drawTrail(s.player); s.bots.forEach(drawTrail);

    s.speedLines.forEach(line => { if(!isVisible(line.x, line.y)) return; ctx.strokeStyle = `rgba(255, 255, 255, ${line.alpha})`; ctx.lineWidth = 2; ctx.beginPath(); const angle = Math.atan2(s.player.vy, s.player.vx) + Math.PI; const x2 = line.x + Math.cos(angle) * line.length; const y2 = line.y + Math.sin(angle) * line.length; ctx.moveTo(line.x, line.y); ctx.lineTo(x2, y2); ctx.stroke(); });

    s.particles.forEach(pt => {
        if(!isVisible(pt.x, pt.y)) return;
        if (pt.type === 'shockwave') { ctx.strokeStyle = pt.color; ctx.lineWidth = 4; ctx.globalAlpha = pt.life / pt.maxLife; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.stroke(); } 
        else if (pt.type === 'impact') { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = pt.life / pt.maxLife; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill(); } 
        else if (pt.type === 'matrix_char') { 
            ctx.fillStyle = '#00ff00'; ctx.font = 'bold 12px monospace'; ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillText(pt.char || '0', pt.x, pt.y);
        }
        else if (pt.type === 'energy_swirl') {
            ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; 
            ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
        }
        else if (pt.type === 'fluid') { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; ctx.beginPath(); const speed = Math.hypot(pt.vx, pt.vy); const ang = Math.atan2(pt.vy, pt.vx); ctx.ellipse(pt.x, pt.y, pt.size + speed * 1.5, pt.size, ang, 0, Math.PI*2); ctx.fill(); } 
        else if (pt.type === 'smoke') {
            ctx.fillStyle = pt.color;
            const lifeRatio = pt.life / pt.maxLife;
            ctx.globalAlpha = lifeRatio * 0.6; // Fade out
            const currentSize = pt.size * (1 + (1 - lifeRatio) * 2); // Expand over time
            
            ctx.save();
            ctx.translate(pt.x, pt.y);
            if (pt.rotation) ctx.rotate(pt.rotation + (pt.rotationSpeed || 0) * (pt.maxLife - pt.life));
            
            // Draw a soft puff
            ctx.beginPath();
            ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        else if (pt.type === 'emoji') {
            const lifeRatio = pt.life / pt.maxLife;
            const entrance = Math.min(1, (pt.maxLife - pt.life) / 10);
            ctx.globalAlpha = lifeRatio * entrance;
            
            ctx.save();
            ctx.translate(pt.x, pt.y);
            const scale = 0.5 + entrance * 0.5;
            ctx.scale(scale, scale);
            
            ctx.font = `${pt.size}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Floating effect
            const floatX = Math.sin(time * 0.005 + pt.x) * 5;
            ctx.fillText(pt.char || '❓', floatX, 0);
            ctx.restore();
        }
        else if (pt.type === 'shell') {
            const zOffset = pt.z || 0;
            const lifeRatio = pt.life / pt.maxLife;
            
            // Shadow (Scales with height)
            if (zOffset > 1) {
                const shadowScale = 1 + zOffset / 40;
                const shadowAlpha = Math.max(0, 0.5 - zOffset / 100) * lifeRatio;
                ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
                ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 4 * shadowScale, 2 * shadowScale, 0, 0, Math.PI*2); ctx.fill();
            }
            
            // Shell Casing
            ctx.save();
            ctx.translate(pt.x, pt.y - zOffset);
            ctx.rotate(pt.rotation || 0);
            
            // Fade out
            ctx.globalAlpha = lifeRatio;
            
            ctx.fillStyle = pt.color;
            ctx.fillRect(-3, -1.5, 6, 3); // Larger brass rect (6x3)
            
            // Detail
            ctx.fillStyle = '#8a6d3b'; // Darker brass band
            ctx.fillRect(-3, -1.5, 1.5, 3); // Base of shell
            
            ctx.strokeStyle = '#665533'; ctx.lineWidth = 0.5; 
            ctx.strokeRect(-3, -1.5, 6, 3);
            
            ctx.restore();
            ctx.globalAlpha = 1;
        }
        else if (pt.type === 'debris') { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.vx * 0.2); ctx.fillRect(-pt.size/2, -pt.size/2, pt.size, pt.size); ctx.restore(); }
        else { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
    });

    s.bullets.forEach(b => {
        if(!isVisible(b.x, b.y)) return;
        
        // REALISTIC PROJECTILE STYLE
        const speed = Math.hypot(b.vx, b.vy);
        const angle = Math.atan2(b.vy, b.vx);
        
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        
        // Determine Type
        const isHeavy = b.size > 6;
        const isSniper = speed > 25 && b.size < 4;
        const isFlame = b.life < 40 && b.color === '#ff5500';
        
        if (b.bType === 'ENERGY_BALL') {
            // VORTEX: Compact Energy Sphere
            // Intense Core
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = b.color; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI*2); ctx.fill();
            
            // Tight Halo
            ctx.fillStyle = b.color;
            ctx.globalAlpha = 0.6;
            ctx.beginPath(); ctx.arc(0, 0, b.size * 1.6, 0, Math.PI*2); ctx.fill();
            
            // Spinning Rings (Science-fiction look)
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
            ctx.beginPath(); 
            ctx.ellipse(0, 0, b.size * 2.2, b.size * 0.8, performance.now() * 0.02, 0, Math.PI*2); 
            ctx.stroke();
            
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        } else if (isFlame) {
            // FLAMETHROWER: Liquid Fire
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 5; ctx.shadowColor = '#ff4400';
            ctx.globalAlpha = b.life / 30;
            // Draw blob
            ctx.beginPath(); 
            ctx.arc(0, 0, b.size * (1 + (30-b.life)/10), 0, Math.PI*2); 
            ctx.fill();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        } else if (isHeavy) {
            // TITAN: Heavy Caliber Shell (Glowing Tracer)
            // Scale visuals based on b.size (base size for heavy is around 50-100)
            const visualScale = b.size / 50;
            
            // Tracer Tail
            const tailLen = 20 * visualScale;
            const grad = ctx.createLinearGradient(-tailLen, 0, 5, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, b.color);
            ctx.fillStyle = grad;
            ctx.fillRect(-tailLen, -2 * visualScale, tailLen + 5, 4 * visualScale);
            
            // Solid Core
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.ellipse(0, 0, 6 * visualScale, 3 * visualScale, 0, 0, Math.PI*2); ctx.fill();
            
            // Glow
            ctx.shadowColor = b.color; ctx.shadowBlur = 10 * visualScale;
            ctx.fillStyle = b.color;
            ctx.beginPath(); ctx.ellipse(0, 0, 4 * visualScale, 2 * visualScale, 0, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
        } else if (isSniper) {
            // EAGLE: High Velocity Kinetic Penetrator
            // Long thin trail
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2;
            ctx.shadowColor = b.color; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(0, 0); ctx.stroke();
            
            // Bright head
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.rect(-5, -1, 10, 2); ctx.fill();
            ctx.shadowBlur = 0;
        } else if (b.projectileCoreColor) {
             // Void / Negative Projectiles (Energy Orb)
             ctx.fillStyle = b.color; // Glow
             ctx.shadowBlur = 20; ctx.shadowColor = b.color;
             ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI*2); ctx.fill();
             
             ctx.fillStyle = b.projectileCoreColor; // Core
             ctx.shadowBlur = 5;
             ctx.beginPath(); ctx.arc(0, 0, b.size * 0.6, 0, Math.PI*2); ctx.fill();
        } else {
            // STANDARD: Tracer Round
            // Trail
            const grad = ctx.createLinearGradient(-15, 0, 0, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, b.color);
            ctx.fillStyle = grad;
            ctx.fillRect(-15, -1.5, 15, 3);
            
            // Bullet
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });

    [s.player, ...s.bots].forEach(c => {
        if (!isVisible(c.x, c.y)) return;
        
        // MUZZLE FLASH LIGHT ON GROUND
        if (c.muzzleFlashTimer > 0) {
            const stats = getCarStats(c.typeIndex);
            const skin = getSkin(c.skinIndex);
            const dist = stats.length / 2 + 20;
            const lx = c.x + Math.cos(c.turretAngle) * dist;
            const ly = c.y + Math.sin(c.turretAngle) * dist;
            
            ctx.save();
            ctx.translate(lx, ly);
            const flashScale = (c.muzzleFlashTimer / 4); // 4 is max timer
            
            // Ground Light
            const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
            grad.addColorStop(0, skin.glowColor);
            grad.addColorStop(1, 'transparent');
            
            ctx.globalAlpha = 0.4 * flashScale;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 150, 0, Math.PI*2);
            ctx.fill();
            
            ctx.restore();
        }

        if (c.tongueState !== 'idle' && !c.isDead) {
             const tx = c.x + Math.cos(c.tongueAngle) * c.tongueLength; const ty = c.y + Math.sin(c.tongueAngle) * c.tongueLength;
             ctx.save(); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo(c.x + Math.cos(c.tongueAngle)*c.tongueLength*0.5 + (Math.random()-0.5)*10, c.y + Math.sin(c.tongueAngle)*c.tongueLength*0.5 + (Math.random()-0.5)*10, tx, ty); ctx.lineWidth = 6; ctx.strokeStyle = '#ff00aa'; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ff88cc'; ctx.stroke(); ctx.fillStyle = '#ff00aa'; ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI*2); ctx.fill(); ctx.restore();
        }
    });

    s.bots.forEach(bot => { if(isVisible(bot.x, bot.y)) drawEntity(ctx, bot); });
    if(isVisible(s.player.x, s.player.y)) drawEntity(ctx, s.player);

    const stats = getCarStats(s.player.typeIndex);
    if (!s.player.isDead) {
        // Aiming X and Laser Sight
        const pSkin = getSkin(s.player.skinIndex); 
        const aimMag = Math.sqrt(s.input.aimX * s.input.aimX + s.input.aimY * s.input.aimY); 
        let dist = stats.range; 
        if (s.input.aimSource === 'joystick') { dist = stats.range * Math.min(1, aimMag); }
        
        // Calculate true tip position
        const tipX = s.player.x + Math.cos(s.player.turretAngle) * dist; 
        const tipY = s.player.y + Math.sin(s.player.turretAngle) * dist;

        ctx.save();
        
        // Active Power Indicator
        if (s.player.activePower !== 'NONE') {
            ctx.save();
            ctx.translate(s.player.x, s.player.y);
            ctx.rotate(-time * 0.005);
            ctx.strokeStyle = POWER_COLORS[s.player.activePower];
            ctx.lineWidth = 2;
            ctx.setLineDash([20, 10]);
            ctx.beginPath();
            ctx.arc(0, 0, 60, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
        }

        // Dashed Line
        ctx.beginPath(); 
        ctx.moveTo(s.player.x, s.player.y); 
        ctx.lineTo(tipX, tipY); 
        ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`; 
        ctx.setLineDash([10, 10]); 
        ctx.lineWidth = 2; 
        ctx.stroke(); 
        
        // X Cursor
        ctx.translate(tipX, tipY); 
        const pulse = 1 + Math.sin(time * 0.015) * 0.1; 
        ctx.scale(pulse, pulse); 
        
        ctx.rotate(time * 0.005); 
        ctx.strokeStyle = pSkin.glowColor; 
        ctx.lineWidth = 3; 
        ctx.shadowColor = pSkin.glowColor; 
        ctx.shadowBlur = 10; 
        
        const size = 15; 
        ctx.beginPath(); 
        ctx.moveTo(-size, -size); ctx.lineTo(size, size); 
        ctx.moveTo(size, -size); ctx.lineTo(-size, size); 
        ctx.stroke(); 
        
        // Inner Dot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0,0, 4, 0, Math.PI*2);
        ctx.fill();
        
        ctx.restore();
    }

    s.damageTexts.forEach(t => { 
        ctx.save(); ctx.translate(t.x, t.y); 
        // Pulsing effect for visibility
        const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.1;
        ctx.scale(t.scale * pulse, t.scale * pulse); 
        
        ctx.font = '900 28px monospace'; // Larger font
        ctx.textAlign = 'center';
        
        // Thick stroke for contrast
        ctx.strokeStyle = '#000000'; 
        ctx.lineWidth = 6; 
        ctx.lineJoin = 'round';
        ctx.strokeText(t.value === 0 ? "POWER!" : t.value.toString(), 0, 0);
        
        ctx.fillStyle = t.color; 
        ctx.shadowColor = t.color; 
        ctx.shadowBlur = 10; 
        ctx.fillText(t.value === 0 ? "POWER!" : t.value.toString(), 0, 0);
        
        // Extra white core for pop
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.value === 0 ? "POWER!" : t.value.toString(), 0, 0);
        
        ctx.restore(); 
    });

    ctx.restore();
    drawEdgeIndicators(ctx, width, height, s);
    drawRadar(ctx, 90, 130, 150, s, false); 
    if(s.showMapOverlay) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, width, height); const radarSize = Math.min(width, height) * 0.8; drawRadar(ctx, width/2, height/2, radarSize, s, true); ctx.font = 'bold 20px monospace'; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.fillText("TAP TO CLOSE RADAR", width/2, height - 50); }
    drawHUD(ctx, width, height, s);
    if (s.announcement) { 
        ctx.save(); 
        ctx.translate(width/2, height/3); 
        
        // Dynamic entrance and exit
        const lifeRatio = s.announcement.life / 60; // Assuming base life is 60
        const entrance = Math.min(1, (60 - s.announcement.life) / 10);
        const exit = Math.min(1, s.announcement.life / 20);
        const alpha = entrance * exit;
        ctx.globalAlpha = alpha;

        // Smooth floating and pulsing
        const floatY = Math.sin(time * 0.002) * 15;
        const pulse = Math.sin(time * 0.003) * 0.08;
        ctx.translate(0, floatY);
        
        const scale = (s.announcement.scale + pulse) * (0.8 + entrance * 0.2); 
        ctx.scale(scale, scale); 
        
        ctx.font = 'black italic 60px monospace'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle'; 
        ctx.shadowBlur = 30; 
        ctx.shadowColor = s.announcement.color; 
        ctx.fillStyle = s.announcement.color; 
        ctx.fillText(s.announcement.text, 0, 0); 
        ctx.fillStyle = '#ffffff'; 
        ctx.fillText(s.announcement.text, -2, -2); 
        
        if(s.announcement.subText) { 
            ctx.font = 'bold 30px monospace'; 
            ctx.fillStyle = '#fff'; 
            ctx.fillText(s.announcement.subText, 0, 50); 
        } 
        ctx.restore(); 
    }
    if (s.matchState === 'COUNTDOWN') { const secs = Math.ceil(s.matchTimer); ctx.save(); ctx.translate(width/2, height/2); ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.5 - (5-s.matchTimer)*0.1)})`; ctx.fillRect(-width/2, -height/2, width, height); const scale = 1 + (s.matchTimer % 1) * 0.5; ctx.scale(scale, scale); ctx.font = '900 120px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const color = secs <= 2 ? '#ff0000' : '#00ffff'; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 40; ctx.fillText(secs.toString(), 0, 0); ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.fillText("PREPARING COMBAT SYSTEMS", 0, 100); ctx.restore(); }
  };

  const drawEdgeIndicators = (ctx: CanvasRenderingContext2D, w: number, h: number, s: GameState) => {
    const cx = w / 2; const cy = h / 2; const xMin = 50; const xMax = w - 50; const yMin = 50; const yMax = h - 50;
    let dangerDetected = false;
    const indicators: { angle: number, dist: number, isEnemy: boolean, bot: CarEntity }[] = [];
    s.bots.forEach(bot => {
        if(bot.isDead) return; 
        const dist = Math.hypot(bot.x - s.player.x, bot.y - s.player.y); 
        
        // Range Check: Only show if medium distance (e.g., < 3000), unless teammate
        const isEnemy = bot.teamId !== s.player.teamId; 
        if (dist > 3000 && isEnemy) return; 
        const dx = bot.x - s.camera.x; const dy = bot.y - s.camera.y; 
        const screenX = cx + dx * s.camera.zoom; const screenY = cy + dy * s.camera.zoom; 
        const onScreen = screenX >= 0 && screenX <= w && screenY >= 0 && screenY <= h;
        
        if (!onScreen) {
            const angle = Math.atan2(dy, dx); 
            indicators.push({ angle, dist, isEnemy, bot });
        }
    });

    // Sort indicators by angle to handle overlap (simple approach)
    indicators.sort((a, b) => a.angle - b.angle);

    // Render Indicators
    indicators.forEach((ind, i) => {
        // Basic overlap prevention: if close to previous, nudge? 
        // For now, just render them. The sorting helps visual grouping.
        // To prevent overlap, we could adjust angle, but that misleads direction.
        // Better to just stack them or offset radius?
        // Let's just render.
        
        const cos = Math.cos(ind.angle); const sin = Math.sin(ind.angle); let t = Infinity;
        if (Math.abs(cos) > 0.01) { const tx1 = (xMin - cx) / cos; const tx2 = (xMax - cx) / cos; if (tx1 > 0) t = Math.min(t, tx1); if (tx2 > 0) t = Math.min(t, tx2); }
        if (Math.abs(sin) > 0.01) { const ty1 = (yMin - cy) / sin; const ty2 = (yMax - cy) / sin; if (ty1 > 0) t = Math.min(t, ty1); if (ty2 > 0) t = Math.min(t, ty2); }
        
        const arrowX = cx + cos * t; const arrowY = cy + sin * t; 
        
        // Fade logic
        const screenRadius = Math.hypot(w/2, h/2) / s.camera.zoom;
        const distToEdge = ind.dist - screenRadius;
        let alpha = 1.0;
        if (distToEdge < 200) alpha = Math.max(0, distToEdge / 200);
        
        ctx.save(); ctx.translate(arrowX, arrowY); ctx.globalAlpha = alpha;
        
        if (ind.isEnemy) { 
            const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5; 
            const isDanger = ind.dist < 1500;
            const color = isDanger ? `rgba(255, 0, 0, ${pulse})` : '#ff4400';
            
            ctx.fillStyle = color; 
            ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; 
            ctx.fillText(`${Math.round(ind.dist/10)}m`, 0, -25);
            
            if (isDanger) {
                ctx.fillText("!", 0, 5); 
                ctx.beginPath(); ctx.rotate(ind.angle); ctx.arc(-20, 0, 40, -0.5, 0.5); 
                ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke(); 
            } else {
                ctx.rotate(ind.angle);
                ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill();
            }
        } 
        else { ctx.fillStyle = '#00aaff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.round(ind.dist/10)}m`, 0, -20); ctx.rotate(ind.angle); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, 8); ctx.lineTo(-10, -8); ctx.fill(); }
        ctx.restore();
    });
    if (dangerDetected) { ctx.save(); ctx.translate(w/2, 100); const pulse = (Math.sin(performance.now() * 0.015) + 1) * 0.5; ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText("PROXIMITY WARNING", 0, 0); ctx.restore(); }
    if (!s.player.isDead) {
        let closestSt: HealingStation | null = null; let minDist = Infinity;
        s.stations.forEach(st => { if (!st.active) return; const dist = Math.hypot(st.x - s.player.x, st.y - s.player.y); if (dist < minDist) { minDist = dist; closestSt = st; } });
        if (closestSt) {
            const st = closestSt as HealingStation; const dx = st.x - s.camera.x; const dy = st.y - s.camera.y; const screenX = cx + dx * s.camera.zoom; const screenY = cy + dy * s.camera.zoom; const onScreen = screenX >= 0 && screenX <= w && screenY >= 0 && screenY <= h;
            if (!onScreen) {
                const angle = Math.atan2(dy, dx); const cos = Math.cos(angle); const sin = Math.sin(angle); let t = Infinity;
                if (Math.abs(cos) > 0.01) { const tx1 = (xMin - cx) / cos; const tx2 = (xMax - cx) / cos; if (tx1 > 0) t = Math.min(t, tx1); if (tx2 > 0) t = Math.min(t, tx2); }
                if (Math.abs(sin) > 0.01) { const ty1 = (yMin - cy) / sin; const ty2 = (yMax - cy) / sin; if (ty1 > 0) t = Math.min(t, ty1); if (ty2 > 0) t = Math.min(t, ty2); }
                const arrowX = cx + cos * t; const arrowY = cy + sin * t; ctx.save(); ctx.translate(arrowX, arrowY); ctx.fillStyle = '#00ff00'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.round(minDist/10)}m`, 0, -25); ctx.rotate(angle); ctx.fillStyle = '#00ff00'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill(); ctx.rotate(-angle); ctx.fillStyle = '#000'; ctx.font = 'bold 12px monospace'; ctx.textBaseline = 'middle'; ctx.fillText("+", 0, 0); ctx.restore();
            }
        }
    }
  };

  const drawRadar = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, size: number, s: GameState, isBig: boolean) => {
      const rRadius = size / 2; 
      const mapScale = isBig ? (rRadius / s.currentArenaRadius) * 0.9 : 0.003 * (25000 / s.currentArenaRadius); 
      
      let viewX = s.player.x; let viewY = s.player.y; 
      if (s.isSpectating) {
          const target = [s.player, ...s.bots].find(c => c.id === s.camera.spectateTargetId);
          if (target) { viewX = target.x; viewY = target.y; }
      }
      if (isBig) { viewX = 0; viewY = 0; }
      
      const time = performance.now();
      ctx.save(); ctx.translate(centerX, centerY); 
      
      // --- HOLOGRAPHIC RADAR BACKGROUND ---
      // Base Dark Glass
      ctx.beginPath(); ctx.arc(0, 0, rRadius, 0, Math.PI * 2); 
      ctx.fillStyle = 'rgba(0, 10, 20, 0.85)'; ctx.fill(); 
      
      // Tech Grid Lines
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)'; ctx.lineWidth = 1;
      const gridSize = rRadius / 4;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, rRadius, 0, Math.PI*2); ctx.clip();
      for(let i=-rRadius; i<rRadius; i+=gridSize) {
          ctx.moveTo(i, -rRadius); ctx.lineTo(i, rRadius);
          ctx.moveTo(-rRadius, i); ctx.lineTo(rRadius, i);
      }
      ctx.stroke(); ctx.restore();

      // Concentric Rings (Distance Markers)
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)'; 
      ctx.beginPath(); ctx.arc(0, 0, rRadius * 0.33, 0, Math.PI*2); ctx.stroke(); 
      ctx.beginPath(); ctx.arc(0, 0, rRadius * 0.66, 0, Math.PI*2); ctx.stroke(); 
      
      // Crosshairs
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.beginPath(); ctx.moveTo(0, -rRadius); ctx.lineTo(0, rRadius); ctx.stroke(); 
      ctx.beginPath(); ctx.moveTo(-rRadius, 0); ctx.lineTo(rRadius, 0); ctx.stroke();
      
      // Outer Tech Border
      ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2; 
      ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, rRadius, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;

      // Rotating Scan Effect
      const scanAngle = (time * 0.003) % (Math.PI * 2);
      ctx.save(); ctx.rotate(scanAngle); 
      const grad = ctx.createLinearGradient(0, 0, rRadius, 0); 
      grad.addColorStop(0, 'rgba(0, 255, 255, 0)'); 
      grad.addColorStop(1, 'rgba(0, 255, 255, 0.4)'); 
      ctx.fillStyle = grad; 
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0, 0, rRadius, -0.3, 0.1); ctx.lineTo(0,0); ctx.fill(); 
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(rRadius, 0); 
      ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.stroke(); 
      ctx.restore();

      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, rRadius, 0, Math.PI * 2); ctx.clip();
      const arenaX = -viewX * mapScale; const arenaY = -viewY * mapScale; 
      ctx.beginPath(); ctx.arc(arenaX, arenaY, s.currentArenaRadius * mapScale, 0, Math.PI * 2); 
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);

      s.stations.forEach(st => { const sx = (st.x - viewX) * mapScale; const sy = (st.y - viewY) * mapScale; ctx.fillStyle = st.active ? (st.occupantId ? '#ff0000' : '#00ff00') : '#555555'; const dotSize = isBig ? 4 : 3; ctx.beginPath(); ctx.rect(sx-dotSize, sy-dotSize, dotSize*2, dotSize*2); ctx.fill(); });

      const drawArrow = (ax: number, ay: number, rot: number, color: string, size: number, isSelf: boolean) => { ctx.save(); ctx.translate(ax, ay); if (isSelf) { const pulse = Math.sin(time * 0.01) * 5; ctx.beginPath(); ctx.arc(0, 0, size + 2 + pulse, 0, Math.PI*2); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); } ctx.rotate(rot); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size, size); ctx.lineTo(-size/2, 0); ctx.lineTo(-size, -size); ctx.fill(); ctx.restore(); };

      if(!s.player.isDead) { 
          const px = (s.player.x - viewX) * mapScale; 
          const py = (s.player.y - viewY) * mapScale; 
          const pSkin = getSkin(s.player.skinIndex);
          drawArrow(px, py, s.player.angle, pSkin.glowColor, isBig ? 10 : 7, true); 
      }
      s.bots.forEach(b => { 
          if (b.isDead) return; 
          
          const isEnemy = b.teamId !== s.player.teamId;
          const timeSinceShot = time - b.lastShot;
          
          // Stealth Logic (Existing) + Shooting Logic (New)
          // Hide if:
          // 1. Enemy AND Stealth is Active
          // 2. Enemy AND Has not shot within visibility window
          if (isEnemy && b.isStealth) return;
          if (isEnemy && timeSinceShot > RADAR_VISIBILITY_MS) return;

          const dx = (b.x - viewX) * mapScale; 
          const dy = (b.y - viewY) * mapScale; 
          
          if (!isEnemy) { 
              // Teammate always visible (Clamp to edge)
              const distFromCenter = Math.hypot(dx, dy);
              let finalX = dx;
              let finalY = dy;
              // If outside radar, clamp to edge (minus padding)
              if (distFromCenter > rRadius - 10) {
                  const angle = Math.atan2(dy, dx);
                  finalX = Math.cos(angle) * (rRadius - 10);
                  finalY = Math.sin(angle) * (rRadius - 10);
              }
              const bSkin = getSkin(b.skinIndex);
              drawArrow(finalX, finalY, b.angle, bSkin.glowColor, isBig ? 8 : 6, false); 
          } else { 
              // Enemy visible due to shooting
              ctx.fillStyle = '#ff0000'; 
              const dotSize = isBig ? 6 : 4; 
              ctx.beginPath(); ctx.arc(dx, dy, dotSize, 0, Math.PI * 2); ctx.fill(); 
              const pulse = (Math.sin(time * 0.01 + b.x) + 1) * 2; 
              ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; ctx.lineWidth = 1; 
              ctx.beginPath(); ctx.arc(dx, dy, dotSize + pulse, 0, Math.PI*2); ctx.stroke(); 
          } 
      });
      ctx.restore(); ctx.restore();
  };

  const drawIcon = (ctx: CanvasRenderingContext2D, type: string, size: number) => {
      ctx.beginPath();
      if (type === 'NITRO') {
          // Lightning Bolt
          ctx.moveTo(size * 0.2, -size * 0.6);
          ctx.lineTo(-size * 0.2, size * 0.1);
          ctx.lineTo(size * 0.1, size * 0.1);
          ctx.lineTo(-size * 0.1, size * 0.6);
          ctx.lineTo(size * 0.4, -size * 0.2);
          ctx.lineTo(size * 0.1, -size * 0.2);
          ctx.closePath();
      } else if (type === 'jump') {
          // Wing / Up Arrow
          ctx.moveTo(0, -size * 0.4);
          ctx.lineTo(size * 0.4, size * 0.2);
          ctx.lineTo(size * 0.2, size * 0.2);
          ctx.lineTo(size * 0.2, size * 0.5);
          ctx.lineTo(-size * 0.2, size * 0.5);
          ctx.lineTo(-size * 0.2, size * 0.2);
          ctx.lineTo(-size * 0.4, size * 0.2);
          ctx.closePath();
      } else if (type === 'tongue') {
          // Hook
          ctx.arc(0, size * 0.1, size * 0.3, 0, Math.PI, false);
          ctx.lineTo(-size * 0.3, -size * 0.4);
          ctx.lineTo(-size * 0.1, -size * 0.4);
          ctx.lineTo(-size * 0.1, size * 0.1);
          ctx.arc(0, size * 0.1, size * 0.1, Math.PI, 0, true);
          ctx.lineTo(size * 0.1, -size * 0.4);
          ctx.lineTo(size * 0.3, -size * 0.4);
          ctx.lineTo(size * 0.3, size * 0.1);
      } else if (type === 'stealth') {
          // Eye
          ctx.moveTo(-size * 0.5, 0);
          ctx.quadraticCurveTo(0, -size * 0.4, size * 0.5, 0);
          ctx.quadraticCurveTo(0, size * 0.4, -size * 0.5, 0);
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
      } else if (type === 'fire_breath') {
          // Flame
          ctx.moveTo(0, size * 0.5);
          ctx.quadraticCurveTo(size * 0.4, size * 0.2, size * 0.4, -size * 0.1);
          ctx.quadraticCurveTo(size * 0.2, -size * 0.5, 0, -size * 0.6);
          ctx.quadraticCurveTo(-size * 0.2, -size * 0.5, -size * 0.4, -size * 0.1);
          ctx.quadraticCurveTo(-size * 0.4, size * 0.2, 0, size * 0.5);
      }
      ctx.fill();
  };

  const drawHUD = (ctx: CanvasRenderingContext2D, w: number, h: number, s: GameState) => {
      if(s.isSpectating) {
          // Draw Exit Button even in spectating mode
          const exitBtnX = w - 60;
          const exitBtnY = 60;
          ctx.save();
          ctx.translate(exitBtnX, exitBtnY);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI*2);
          ctx.fill(); ctx.stroke();
          
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
          ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
          ctx.stroke();
          
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText("EXIT", 0, 40);
          ctx.restore();
          return;
      }
      if (s.showMapOverlay) return;

      const p = s.player; const pSkin = getSkin(p.skinIndex); const carColor = pSkin.glowColor; const btnSize = 64;
      const time = performance.now();

      // --- CINEMATIC NITRO BUTTON ---
      const boostBtnPos = s.hudLayout.boostBtn;
      ctx.save(); 
      ctx.translate(boostBtnPos.x + btnSize/2, boostBtnPos.y + btnSize/2);
      
      // Dynamic Pulse
      const nitroPulse = s.input.isBoosting ? 1.2 : 1.0 + Math.sin(time * 0.005) * 0.05;
      ctx.scale(nitroPulse, nitroPulse);
      
      // Glass Background
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2);
      ctx.fillStyle = s.input.isBoosting ? 'rgba(255, 200, 0, 0.4)' : 'rgba(0, 0, 0, 0.5)';
      ctx.fill();
      
      // Tech Ring
      ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI*2);
      ctx.strokeStyle = s.input.isBoosting ? '#ffff00' : '#555';
      ctx.lineWidth = 2; ctx.stroke();
      
      // Fuel Gauge Ring
      const fuelPct = p.boostFuel / MAX_BOOST;
      ctx.beginPath(); ctx.arc(0, 0, 42, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * fuelPct));
      ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 10;
      ctx.stroke(); ctx.shadowBlur = 0;

      // Icon (Lightning)
      ctx.fillStyle = s.input.isBoosting ? '#ffffff' : '#ffff00';
      if (s.input.isBoosting) { ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 15; }
      drawIcon(ctx, 'NITRO', 40);
      ctx.shadowBlur = 0;
      
      ctx.restore();

      const dashW = 400; const dashH = 90; const dashX = w / 2 - dashW / 2; const dashY = h - 50;
      ctx.save(); ctx.translate(dashX, dashY);
      ctx.fillStyle = 'rgba(10, 15, 20, 0.85)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(dashW + 20, 0); ctx.lineTo(dashW, 40); ctx.lineTo(0, 40); ctx.closePath(); ctx.fill(); ctx.stroke();

      const reloadPct = 1 - (p.reloadTimer / RELOAD_TIME); ctx.textAlign = 'center';
      if(p.reloadTimer > 0) { ctx.font = 'bold italic 20px monospace'; ctx.fillStyle = '#ff4400'; ctx.fillText("RELOAD", dashW/2, 25); ctx.fillStyle = '#333'; ctx.fillRect(dashW/2 - 40, 30, 80, 4); ctx.fillStyle = '#ff4400'; ctx.fillRect(dashW/2 - 40, 30, 80 * reloadPct, 4); } else { ctx.font = 'black italic 32px monospace'; ctx.fillStyle = carColor; ctx.shadowColor = carColor; ctx.shadowBlur = 10; ctx.fillText(`${p.ammo}`, dashW/2, 30); ctx.shadowBlur = 0; }

      const boostPct = p.boostFuel / MAX_BOOST; const barW = 140;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(dashW/2 + 50, 5); ctx.lineTo(dashW/2 + 50 + barW, 5); ctx.lineTo(dashW/2 + 50 + barW - 10, 35); ctx.lineTo(dashW/2 + 50 - 10, 35); ctx.fill();
      ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(dashW/2 + 50, 5); ctx.lineTo(dashW/2 + 50 + (barW * boostPct), 5); ctx.lineTo(dashW/2 + 50 + (barW * boostPct) - 10, 35); ctx.lineTo(dashW/2 + 50 - 10, 35); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right'; ctx.fillText("NITRO", dashW/2 + 50 + barW - 5, 25);

      const hpPct = p.health / p.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(dashW/2 - 50, 5); ctx.lineTo(dashW/2 - 50 - barW, 5); ctx.lineTo(dashW/2 - 50 - barW + 10, 35); ctx.lineTo(dashW/2 - 50 + 10, 35); ctx.fill();
      const hpColor = hpPct > 0.3 ? '#00ff44' : '#ff0000'; ctx.fillStyle = hpColor; ctx.shadowColor = hpColor; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(dashW/2 - 50, 5); ctx.lineTo(dashW/2 - 50 - (barW * hpPct), 5); ctx.lineTo(dashW/2 - 50 - (barW * hpPct) + 10, 35); ctx.lineTo(dashW/2 - 50 + 10, 35); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.fillText("HULL", dashW/2 - 50 - barW + 5, 25); ctx.restore();

      // --- EXIT BUTTON (Mobile Friendly) ---
      const exitBtnX = w - 60;
      const exitBtnY = 60;
      ctx.save();
      ctx.translate(exitBtnX, exitBtnY);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      
      // X Icon
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
      ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
      ctx.stroke();
      
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText("EXIT", 0, 40);
      ctx.restore();
      
      // --- CINEMATIC SCOREBOARD (Top Center) ---
      ctx.save();
      ctx.translate(w/2, 40);
      
      // Background Plate
      ctx.beginPath();
      ctx.moveTo(-100, -40);
      ctx.lineTo(100, -40);
      ctx.lineTo(80, 20);
      ctx.lineTo(-80, 20);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Score Text
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 24px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
      ctx.fillText(`${Math.floor(s.player.score)}`, 0, 5);
      ctx.shadowBlur = 0;
      
      // Label
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px monospace';
      ctx.fillText("SCORE", 0, -15);
      
      ctx.restore();
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, p: CarEntity, isMenu = false) => {
    if (p.isDead && !isMenu) return;
    const stats = getCarStats(p.typeIndex);
    const skin = getSkin(p.skinIndex);
    const jumpScale = 1 + (p.z * 0.02);
    
    // --- ANIMATED SKIN COLORS & MAD MAX NEON STYLE ---
    let carFillColor = skin.colors[0];
    let carStrokeColor = skin.glowColor;
    const time = performance.now();

    // ZOOM COMPENSATION (Keep car visible/sharp when zoomed out)
    const currentZoom = state.current.camera.zoom;
    let renderScale = 1.0;
    if (!isMenu && currentZoom < 0.6) {
        // Boost scale slightly as we zoom out to keep it readable
        renderScale = 1 + (0.6 - currentZoom) * 0.8;
    }

    // 1. Calculate the Main Fill Color based on Skin Type
    if (skin.type === 'GRADIENT') {
        const grad = ctx.createLinearGradient(-30, -30, 30, 30);
        skin.colors.forEach((c, i) => grad.addColorStop(i / (skin.colors.length - 1), c));
        carFillColor = grad as any;
    } else if (skin.type === 'RAINBOW') {
        const hue = (time * 0.1) % 360;
        carFillColor = `hsl(${hue}, 100%, 50%)`;
        carStrokeColor = `hsl(${hue}, 100%, 80%)`;
    } else if (skin.type === 'HACKER') {
        // Hacker is mostly dark green/black, but with flashes
        carFillColor = '#001a00';
        carStrokeColor = Math.random() > 0.9 ? '#ffffff' : skin.colors[0];
    } else if (skin.type === 'VOID') {
        carFillColor = '#050505';
        carStrokeColor = '#ffffff';
    } else if (skin.type === 'NEG') {
        carFillColor = '#ffffff';
        carStrokeColor = '#000000';
    } else if (skin.type === 'PLASMA') {
        const pulse = Math.sin(time * 0.005) * 0.5 + 0.5;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
        grad.addColorStop(0, skin.colors[0]);
        grad.addColorStop(pulse, skin.colors[1] || skin.colors[0]);
        grad.addColorStop(1, skin.colors[0]);
        carFillColor = grad as any;
        carStrokeColor = skin.glowColor;
    } else if (skin.type === 'GOLD') {
        const grad = ctx.createLinearGradient(-20, -20, 20, 20);
        grad.addColorStop(0, '#ffd700');
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#ffaa00');
        carFillColor = grad as any;
        carStrokeColor = '#ffd700';
    } else if (skin.type === 'GLITCH') {
        if (Math.random() > 0.9) {
            carFillColor = skin.colors[Math.floor(Math.random() * skin.colors.length)];
            carStrokeColor = '#ffffff';
        } else {
            carFillColor = '#111';
            carStrokeColor = skin.colors[0];
        }
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    if (!isMenu) {
        ctx.scale(renderScale, renderScale); // Apply Zoom Compensation
        ctx.save();
        const shadowScale = Math.max(0.2, 1 - (p.z / 100)); const shadowAlpha = Math.max(0.1, 0.5 - (p.z / 50));
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 30 * shadowScale, 15 * shadowScale, p.angle, 0, Math.PI*2); ctx.fill();

        if (p.z === 0) {
            const glowRad = 80;
            const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, glowRad);
            glow.addColorStop(0, addAlphaToColor(carStrokeColor, '44')); // Lower opacity glow for solid bodies
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow; ctx.globalCompositeOperation = 'screen'; 
            ctx.beginPath(); ctx.arc(0,0, glowRad, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
    
    // --- CINEMATIC ENERGY SWIRL EFFECT ---
    if (!isMenu && p.energySwirlTimer > 0) {
        const t = p.energySwirlTimer;
        const maxT = 40;
        const alpha = t / maxT;
        ctx.save();
        
        // Spin logic
        ctx.rotate(time * 0.02);
        
        ctx.strokeStyle = skin.glowColor;
        ctx.lineWidth = 4 * alpha;
        ctx.shadowBlur = 20 * alpha;
        ctx.shadowColor = skin.glowColor;
        
        // Draw 3 spiral arms
        ctx.beginPath();
        for(let i=0; i<3; i++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.moveTo(35, 0); // Start offset from car center
            // Spiral arc
            ctx.arc(0, 0, 80 * (1-alpha) + 50, 0, Math.PI * 0.8);
        }
        ctx.stroke();
        
        ctx.restore();
    }

    // --- LEGENDARY SKIN EFFECTS (User Requested) ---
    if (!isMenu && !p.isDead) {
        // "Roxo que solta fumaça preta" (Purple releasing black smoke)
        if (skin.id === 'purple' || skin.id === 'plasma') {
             if (Math.random() < 0.3) {
                 state.current.particles.push({
                     x: p.x + (Math.random()-0.5)*20,
                     y: p.y + (Math.random()-0.5)*20,
                     vx: (Math.random()-0.5)*2,
                     vy: (Math.random()-0.5)*2 - 2, // Float up
                     life: 40 + Math.random()*20,
                     maxLife: 60,
                     color: '#000000',
                     size: 5 + Math.random()*8,
                     type: 'smoke'
                 });
             }
        }
        
        // "Preto com orbs branco girando" (Black with white orbiting orbs)
        if (skin.id === 'void' || skin.id === 'midnight' || skin.id === 'celestial') {
             // Draw orbiting orbs directly here for smoothness
             const orbCount = 3;
             const radius = 50;
             const speed = time * 0.005;
             const orbColor = skin.id === 'celestial' ? '#ffd700' : '#ffffff';
             
             ctx.save();
             ctx.fillStyle = orbColor;
             ctx.shadowColor = orbColor;
             ctx.shadowBlur = 10;
             
             for(let i=0; i<orbCount; i++) {
                 const angle = speed + (i * (Math.PI * 2 / orbCount));
                 const ox = Math.cos(angle) * radius;
                 const oy = Math.sin(angle) * radius;
                 
                 ctx.beginPath();
                 ctx.arc(ox, oy, 4, 0, Math.PI*2);
                 ctx.fill();
                 
                 // Trail for orb
                 ctx.strokeStyle = skin.id === 'celestial' ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255,255,255,0.3)';
                 ctx.lineWidth = 2;
                 ctx.beginPath();
                 ctx.arc(0, 0, radius, angle - 0.5, angle);
                 ctx.stroke();
             }
             ctx.restore();
        }
        
        // Shadowflame / Toxic Effects
        if (skin.id === 'shadowflame' || skin.id === 'toxic') {
             if (Math.random() < 0.4) {
                 const color = skin.id === 'shadowflame' ? '#aa00ff' : '#00ff00';
                 const type = skin.id === 'shadowflame' ? 'fire' : 'smoke';
                 state.current.particles.push({
                     x: p.x + (Math.random()-0.5)*20,
                     y: p.y + (Math.random()-0.5)*20,
                     vx: (Math.random()-0.5)*2,
                     vy: (Math.random()-0.5)*2 - 2,
                     life: 30 + Math.random()*20,
                     maxLife: 50,
                     color: color,
                     size: 6 + Math.random()*6,
                     type: type
                 });
             }
        }
    }


    ctx.save();
    if (!isMenu) { ctx.translate(0, -p.z * 4); ctx.scale(jumpScale, jumpScale); }
    if (p.isDocked && !isMenu) { ctx.shadowColor = '#00ff00'; ctx.shadowBlur = 20; ctx.translate(0, Math.sin(performance.now() * 0.02) * 5); }
    if (p.hitMarkerTimer > 0 && !isMenu) { ctx.save(); ctx.rotate(performance.now() * 0.01); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 4; ctx.globalAlpha = Math.min(1, p.hitMarkerTimer / 10); ctx.beginPath(); ctx.arc(0,0, 70, 0, Math.PI/2); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0, 70, Math.PI, Math.PI * 1.5); ctx.stroke(); ctx.restore(); }
    
    // --- CINEMATIC FLOATING UI (Name & Health) ---
    if (p.name && !isMenu) {
        ctx.save();
        // Undo car transform to get back to world space, then go to tag pos
        ctx.translate(-p.x, -p.y); // Back to world 0,0 (relative to camera transform)
        
        // Round position to prevent sub-pixel jitter (trembling)
        const tx = Math.round(p.tagPos.x);
        const ty = Math.round(p.tagPos.y);
        ctx.translate(tx, ty);
        
        // Scale compensation for UI text (keep it readable)
        const uiScale = Math.max(1, 1 / currentZoom);
        ctx.scale(uiScale, uiScale);
        
        // Smart Transparency (Fade if blocking car)
        const distToCar = Math.hypot(p.x - p.tagPos.x, p.y - p.tagPos.y);
        let uiAlpha = 1.0;
        // If tag is directly over car (visually), fade it. 
        // We use a generous radius since the tag is large.
        if (distToCar < 150) {
             uiAlpha = Math.max(0.3, (distToCar - 50) / 100);
        }
        ctx.globalAlpha = uiAlpha;

        // 1. NAME TAG (Gravity Floating)
        const teamColor = (p.teamId === state.current.player.teamId) ? '#00aaff' : '#ff0000';
        ctx.font = '900 12px "JetBrains Mono", monospace';
        const textMetrics = ctx.measureText(p.name);
        const textWidth = textMetrics.width;
        const padding = 6;
        
        // Glass Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-textWidth/2 - padding, -20, textWidth + padding*2, 20, 4);
        ctx.fill();
        ctx.stroke();
        
        // Team Indicator Strip
        ctx.fillStyle = teamColor;
        ctx.fillRect(-textWidth/2 - padding, -20, 3, 20);
        
        // Name Text
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, 0, -6);
        ctx.shadowBlur = 0;
        
        // Score/Level
        const scoreTxt = `LVL ${Math.floor(p.score/100)}`;
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'center';
        ctx.fillText(scoreTxt, 0, -24);

        // Likes/Dislikes
        if (p.likes > 0 || p.dislikes > 0) {
            ctx.save();
            const floatY = Math.sin(time * 0.004 + p.x) * 2;
            ctx.translate(0, floatY);
            ctx.font = 'bold 8px monospace';
            const likeTxt = `👍${p.likes} 👎${p.dislikes}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(likeTxt, 0, -34);
            ctx.restore();
        }

        // 2. CINEMATIC HEALTH BAR
        const barW = 60;
        const barH = 6;
        const barY = 5; // Below name
        
        // Background (Dark Slot)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        // Slanted tech shape
        ctx.moveTo(-barW/2 - 2, barY);
        ctx.lineTo(barW/2 + 2, barY);
        ctx.lineTo(barW/2, barY + barH);
        ctx.lineTo(-barW/2, barY + barH);
        ctx.closePath();
        ctx.fill();
        
        // Damage Trail (White/Yellow delayed bar)
        const visPct = Math.max(0, p.visualHealth / p.maxHealth);
        const hpPct = Math.max(0, p.health / p.maxHealth);
        
        if (visPct > hpPct) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(-barW/2, barY);
            ctx.lineTo(-barW/2 + barW * visPct, barY);
            ctx.lineTo(-barW/2 + barW * visPct - 2, barY + barH);
            ctx.lineTo(-barW/2, barY + barH);
            ctx.fill();
        }
        
        // Actual Health (Gradient)
        const hpGrad = ctx.createLinearGradient(-barW/2, 0, barW/2, 0);
        hpGrad.addColorStop(0, '#ff0000');
        hpGrad.addColorStop(0.5, '#ffff00');
        hpGrad.addColorStop(1, '#00ff00');
        
        ctx.fillStyle = hpPct < 0.3 ? '#ff0000' : (teamColor === '#00aaff' ? '#00ff44' : '#ff3333');
        
        ctx.beginPath();
        ctx.moveTo(-barW/2, barY);
        ctx.lineTo(-barW/2 + barW * hpPct, barY);
        ctx.lineTo(-barW/2 + barW * hpPct - 2, barY + barH);
        ctx.lineTo(-barW/2, barY + barH);
        ctx.fill();
        
        // Tech Border / Segments
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        // Draw segment lines
        for(let i=1; i<4; i++) {
            const sx = -barW/2 + (barW/4)*i;
            ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(sx-1, barY+barH); ctx.stroke();
        }
        
        // Shield Overlay (if active)
        if (p.activePower === 'SHIELD') {
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.strokeRect(-barW/2 - 2, barY - 2, barW + 4, barH + 4);
        }

        ctx.restore();
        ctx.globalAlpha = 1.0; // Reset alpha
    }
    
    // Health Bar (Legacy removed)
    // if (!isMenu) { const barW = 50; const hpPct = p.health / p.maxHealth; ctx.fillStyle = '#333'; ctx.fillRect(-barW/2, -65, barW, 4); const teamColor = (p.teamId === state.current.player.teamId) ? '#00aaff' : '#ff0000'; ctx.fillStyle = teamColor; ctx.fillRect(-barW/2, -65, barW * hpPct, 4); }

    ctx.rotate(p.angle);
    
    // --- DRAW WHEELS (Rugged, Treaded, Animated, 3D) ---
    const wheelColor = skin.type === 'VOID' ? '#111' : '#181818';
    const drawWheel = (x: number, y: number, w: number, h: number, isFront: boolean) => {
        ctx.save(); 
        
        // Suspension Travel (Vertical movement relative to car body)
        // If rolling left (turning right), left wheels compress (move up/in?), right wheels extend.
        // Actually, simpler: just keep wheels fixed to "ground" while body moves.
        // But here we are drawing wheels relative to car center.
        // We will shift the BODY later, so wheels stay "fixed" relative to the axle.
        
        ctx.translate(x, y);
        if (isFront) ctx.rotate(p.steering); 
        
        // 3D Tire Thickness (Fake depth)
        const depth = 4;
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.roundRect(-w/2, -h/2 + depth, w, h, 4); ctx.fill();

        // Main Tire Surface
        ctx.fillStyle = wheelColor; 
        ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 4); ctx.fill();
        
        // Animated Treads
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 4); ctx.clip();
        
        const treadGap = 5;
        const offset = (p.wheelAngle * 5) % treadGap; // Faster spin visual
        
        ctx.beginPath();
        for (let i = -w/2; i <= w/2 + treadGap; i += treadGap) {
            const tx = i + offset;
            if (tx >= -w/2 && tx <= w/2) {
                // Chevron tread pattern
                ctx.moveTo(tx, -h/2); 
                ctx.lineTo(tx + 2, 0);
                ctx.lineTo(tx, h/2);
            }
        }
        ctx.stroke();
        ctx.restore();

        // Rim / Hubcap
        if (skin.type !== 'VOID') {
             const rimSize = h * 0.6;
             ctx.fillStyle = '#333';
             ctx.beginPath(); ctx.arc(0, 0, rimSize/2, 0, Math.PI*2); ctx.fill();
             
             // Glowing Center
             ctx.fillStyle = carStrokeColor;
             ctx.shadowColor = carStrokeColor; ctx.shadowBlur = 5;
             ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
             ctx.shadowBlur = 0;
             
             // Spokes
             ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
             ctx.beginPath();
             ctx.moveTo(-rimSize/2, 0); ctx.lineTo(rimSize/2, 0);
             ctx.moveTo(0, -rimSize/2); ctx.lineTo(0, rimSize/2);
             ctx.stroke();
        }

        ctx.restore();
    };

    const len = stats.length; const wid = stats.width;
    // Draw 4 or 6 wheels based on car type
    if (stats.name === "TITAN") {
        drawWheel(len/2 - 10, -wid/2-4, 20, 14, true); drawWheel(len/2 - 10, wid/2+4, 20, 14, true);
        drawWheel(0, -wid/2-4, 20, 14, false); drawWheel(0, wid/2+4, 20, 14, false);
        drawWheel(-len/2 + 10, -wid/2-4, 20, 14, false); drawWheel(-len/2 + 10, wid/2+4, 20, 14, false);
    } else if (stats.name === "REI DO INFERNO") {
        // Massive Hell Wheels - Glowing molten core, no spikes
        const drawHellWheel = (x: number, y: number, w: number, h: number, isFront: boolean) => {
            ctx.save(); ctx.translate(x, y);
            if (isFront) ctx.rotate(p.wheelAngle);
            
            // Outer tire
            ctx.fillStyle = '#0a0500';
            ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 6); ctx.fill();
            
            // Molten treads
            ctx.strokeStyle = '#ff3300'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
            ctx.beginPath();
            for(let i=-w/2+2; i<w/2; i+=6) {
                ctx.moveTo(i, -h/2); ctx.lineTo(i+4, 0); ctx.lineTo(i, h/2);
            }
            ctx.stroke();
            
            // Glowing hub
            ctx.fillStyle = '#ffaa00'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(0, 0, h/3, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        };
        drawHellWheel(len/2 - 10, -wid/2-6, 28, 18, true); drawHellWheel(len/2 - 10, wid/2+6, 28, 18, true);
        drawHellWheel(-len/2 + 10, -wid/2-6, 30, 20, false); drawHellWheel(-len/2 + 10, wid/2+6, 30, 20, false);
    } else {
        drawWheel(len/2 - 10, -wid/2-3, 18, 10, true); drawWheel(len/2 - 10, wid/2+3, 18, 10, true);
        drawWheel(-len/2 + 10, -wid/2-3, 20, 12, false); drawWheel(-len/2 + 10, wid/2+3, 20, 12, false);
    }

    // --- SUSPENSION PHYSICS (Body Roll & Pitch) ---
    ctx.save(); // Start Body Transform
    
    // Calculate Physics Forces
    const speed = Math.hypot(p.vx, p.vy);
    const maxSpeed = stats.baseSpeed * 1.5;
    const speedRatio = Math.min(1.5, speed / maxSpeed);
    
    // Roll: Lateral shift based on steering
    // Turning Right (steering > 0) -> Body rolls Left (-Y)
    const rollAmount = -p.steering * speedRatio * 6.0; 
    
    // Pitch: Longitudinal shift based on boost/braking
    // Boosting -> Squat (Shift Back -X)
    // We don't have braking state easily, but we can use boost
    let pitchAmount = 0;
    if (p.isBoosting) pitchAmount = -4; // Squat
    
    // Apply Suspension Transform
    ctx.translate(pitchAmount, rollAmount);
    
    // Slight rotation for extra "lean" feel
    ctx.rotate(p.steering * speedRatio * 0.05);

    // --- DRAW CHASSIS (Cinematic 3D Effect) ---
    ctx.shadowBlur = p.isDocked ? 20 : 0; ctx.shadowColor = p.isDocked ? '#00ff00' : carStrokeColor; 
    
    // Define Car Shape Path Function
    const drawCarShape = () => {
        ctx.beginPath();
        if (stats.name === "VORTEX" || stats.name === "NOVA") {
            // Hypercar / Racer - Sleek, aerodynamic
            ctx.moveTo(len/2 + 20, 0); 
            ctx.lineTo(len/4 + 5, -wid/2 + 2); 
            ctx.lineTo(-len/4, -wid/2 + 4);
            ctx.lineTo(-len/2, -wid/3); 
            ctx.lineTo(-len/2 - 8, -wid/4 + 2); // Rear wing edge
            ctx.lineTo(-len/2 - 8, wid/4 - 2); 
            ctx.lineTo(-len/2, wid/3); 
            ctx.lineTo(-len/4, wid/2 - 4);
            ctx.lineTo(len/4 + 5, wid/2 - 2); 
            ctx.closePath();
        } else if (stats.name === "TITAN") {
            // Heavy Tank - Brutalist, angular, armored
            ctx.moveTo(len/2 + 12, -wid/3);
            ctx.lineTo(len/2 + 12, wid/3);
            ctx.lineTo(len/3, wid/2 + 6);
            ctx.lineTo(-len/3, wid/2 + 6);
            ctx.lineTo(-len/2 - 6, wid/3);
            ctx.lineTo(-len/2 - 6, -wid/3);
            ctx.lineTo(-len/3, -wid/2 - 6);
            ctx.lineTo(len/3, -wid/2 - 6);
            ctx.closePath();
        } else if (stats.name === "EAGLE") {
            // Sniper / Jet - Stealth fighter inspired
            ctx.moveTo(len/2 + 30, 0); 
            ctx.lineTo(len/4, -wid/5);
            ctx.lineTo(0, -wid/2 - 4); // Swept wing
            ctx.lineTo(-len/4, -wid/2);
            ctx.lineTo(-len/2 - 4, -wid/3); 
            ctx.lineTo(-len/2 + 8, 0); // Engine exhaust notch
            ctx.lineTo(-len/2 - 4, wid/3); 
            ctx.lineTo(-len/4, wid/2);
            ctx.lineTo(0, wid/2 + 4); 
            ctx.lineTo(len/4, wid/5);
            ctx.closePath();
        } else if (stats.name === "RAZOR") {
            // Spiky / Aggressive - Mad Max style
            ctx.moveTo(len/2 + 22, 0);
            ctx.lineTo(len/3, -wid/2 + 2);
            ctx.lineTo(len/6, -wid/2 - 12); // Front Spike
            ctx.lineTo(0, -wid/2);
            ctx.lineTo(-len/4, -wid/2 - 8); // Mid Spike
            ctx.lineTo(-len/2 - 8, -wid/3);
            ctx.lineTo(-len/2, 0);
            ctx.lineTo(-len/2 - 8, wid/3);
            ctx.lineTo(-len/4, wid/2 + 8);
            ctx.lineTo(0, wid/2);
            ctx.lineTo(len/6, wid/2 + 12);
            ctx.lineTo(len/3, wid/2 - 2);
            ctx.closePath();
        } else if (stats.name === "REI DO INFERNO") {
            // Hellish Chariot - Organic, demonic shape
            ctx.moveTo(len/2 + 15, 0); // Pointy snout
            ctx.quadraticCurveTo(len/4, -wid/2 - 5, 0, -wid/2 + 2); // Curved side
            ctx.lineTo(-len/4, -wid/2 - 8); // Side horn
            ctx.lineTo(-len/2 - 5, -wid/4); 
            ctx.lineTo(-len/2 - 12, -wid/6); // Rear horn
            ctx.lineTo(-len/2 - 5, 0); 
            ctx.lineTo(-len/2 - 12, wid/6); // Rear horn
            ctx.lineTo(-len/2 - 5, wid/4); 
            ctx.lineTo(-len/4, wid/2 + 8); // Side horn
            ctx.lineTo(0, wid/2 - 2); 
            ctx.quadraticCurveTo(len/4, wid/2 + 5, len/2 + 15, 0);
            ctx.closePath();
        } else {
            // Muscle Car (Standard) - Classic blocky
            ctx.moveTo(len/2 + 10, -wid/4); 
            ctx.lineTo(len/2 + 10, wid/4); 
            ctx.lineTo(len/2, wid/2 - 2); 
            ctx.lineTo(-len/2 + 4, wid/2); 
            ctx.lineTo(-len/2 - 4, wid/3); 
            ctx.lineTo(-len/2 - 4, -wid/3); 
            ctx.lineTo(-len/2 + 4, -wid/2); 
            ctx.lineTo(len/2, -wid/2 + 2); 
            ctx.closePath();
        }
    };

    // 1. Draw "Lower Body" (Chassis Depth) - Darker, slightly offset
    // This gives the illusion of height/thickness
    ctx.save();
    ctx.translate(0, 4); // Fake 3D depth offset
    ctx.fillStyle = '#050505'; 
    drawCarShape();
    ctx.fill();
    ctx.restore();

    // 2. Draw Main Body with Metallic Gradient
    // Create a metallic gradient for the body
    let bodyFill: string | CanvasGradient = carFillColor;
    if (skin.type !== 'GRADIENT' && skin.type !== 'RAINBOW' && skin.type !== 'VOID' && skin.type !== 'PLASMA' && skin.type !== 'GOLD') {
        const bodyGrad = ctx.createLinearGradient(-len/2, -wid/2, len/2, wid/2);
        bodyGrad.addColorStop(0, carFillColor as string);
        bodyGrad.addColorStop(0.4, '#111'); // Dark band
        bodyGrad.addColorStop(0.6, carFillColor as string);
        bodyGrad.addColorStop(1, '#000'); // Shadow
        bodyFill = bodyGrad;
    }

    ctx.fillStyle = bodyFill;
    ctx.strokeStyle = carStrokeColor; 
    ctx.lineWidth = 2;

    drawCarShape();
    ctx.fill();
    ctx.stroke();

    // 3. Add "Engine Glow" or Vents (Detailing)
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.7;
    
    // Hood Vents / Engine Block
    ctx.beginPath();
    if (stats.name === "TITAN") {
        // Heavy vents
        ctx.rect(-15, -12, 25, 24);
        ctx.fillStyle = '#111'; ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(-10, -10, 4, 20);
        ctx.fillRect(-2, -10, 4, 20);
        ctx.fillRect(6, -10, 4, 20);
    } else if (stats.name === "EAGLE") {
        // Streamlined cockpit
        ctx.moveTo(15, 0); ctx.lineTo(-15, -8); ctx.lineTo(-15, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)'; // Glass reflection
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.fill();
    } else if (stats.name === "REI DO INFERNO") {
        // Demonic Core / Ribcage
        ctx.fillStyle = '#110000';
        ctx.fillRect(-15, -10, 30, 20);
        
        ctx.fillStyle = '#ff2200'; ctx.globalAlpha = 0.8;
        // Glowing ribs
        for(let i=-10; i<=10; i+=5) {
            ctx.fillRect(i, -12, 2, 24);
        }
        // Core eye
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    } else {
        // Standard Vents
        ctx.moveTo(len/4, -wid/5); 
        ctx.lineTo(len/2 - 5, -wid/8); 
        ctx.lineTo(len/2 - 5, wid/8); 
        ctx.lineTo(len/4, wid/5);
        ctx.fill();
    }
    
    // Spoiler / Wing (Rear)
    if (stats.name === "VORTEX" || stats.name === "RAZOR" || stats.name === "NOVA") {
        ctx.fillStyle = carStrokeColor;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(-len/2 + 2, -wid/2 - 4);
        ctx.lineTo(-len/2 + 12, -wid/4);
        ctx.lineTo(-len/2 + 12, wid/4);
        ctx.lineTo(-len/2 + 2, wid/2 + 4);
        ctx.lineTo(-len/2 - 4, wid/2);
        ctx.lineTo(-len/2 + 4, wid/4);
        ctx.lineTo(-len/2 + 4, -wid/4);
        ctx.lineTo(-len/2 - 4, -wid/2);
        ctx.fill();
        
        // Spoiler struts
        ctx.fillStyle = '#111';
        ctx.fillRect(-len/2 + 6, -wid/4, 4, 2);
        ctx.fillRect(-len/2 + 6, wid/4 - 2, 4, 2);
    }
    
    ctx.restore();

    // --- DETAILS (Armor Plates, Vents, Hacker Code) ---
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Dark overlay for details
    
    // Windshield / Cockpit
    ctx.beginPath();
    ctx.moveTo(len/6, -wid/4);
    ctx.lineTo(-len/4, -wid/3);
    ctx.lineTo(-len/4, wid/3);
    ctx.lineTo(len/6, wid/4);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    // Glass Glint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(-len/4 + 5, -wid/4 + 2);
    ctx.lineTo(-len/4 + 2, wid/4 - 2);
    ctx.lineTo(-len/4 + 8, wid/4 - 4);
    ctx.fill();

    // Hacker Effect Details
    if (skin.type === 'HACKER') {
        ctx.fillStyle = '#00ff00';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.random() > 0.5 ? '101' : '010', 0, 2);
    } else if (skin.type === 'GLITCH') {
        if (Math.random() > 0.8) {
            ctx.fillStyle = skin.colors[Math.floor(Math.random() * skin.colors.length)];
            ctx.fillRect((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, 10, 2);
        }
    } else if (skin.type === 'PLASMA') {
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(time * 0.01) * 0.2;
        ctx.fillStyle = skin.glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, 25 + Math.sin(time * 0.005) * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Rear Vents / Exhaust Pipes
    ctx.fillStyle = '#222';
    // Draw dual exhausts on back
    ctx.fillRect(-len/2 - 2, -wid/4, 6, 4);
    ctx.fillRect(-len/2 - 2, wid/4 - 4, 6, 4);
    
    // Armor Plates (Mad Max Style)
    if (skin.type !== 'VOID' && skin.type !== 'HACKER') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        // Roof Plate
        ctx.fillRect(-10, -8, 20, 16);
        // "Bolts"
        ctx.fillStyle = '#555';
        ctx.beginPath(); 
        ctx.arc(-8, -6, 1, 0, Math.PI*2); ctx.arc(8, -6, 1, 0, Math.PI*2);
        ctx.arc(-8, 6, 1, 0, Math.PI*2); ctx.arc(8, 6, 1, 0, Math.PI*2);
        ctx.fill();
    }

    // Boost Flames (Behind)
    if (p.isBoosting && !p.isDocked) {
        ctx.save(); ctx.translate(-len/2 - 5, 0); ctx.globalCompositeOperation = 'screen';
        const beamLen = 120 + Math.random() * 40; const beamW = 12 + Math.random() * 4;
        const beamGrad = ctx.createLinearGradient(0, 0, -beamLen, 0); 
        beamGrad.addColorStop(0, '#fff'); 
        beamGrad.addColorStop(0.2, skin.glowColor); 
        beamGrad.addColorStop(1, 'transparent'); 
        ctx.fillStyle = beamGrad; 
        ctx.beginPath(); ctx.moveTo(0, -beamW/2); ctx.lineTo(-beamLen, 0); ctx.lineTo(0, beamW/2); ctx.fill();
        ctx.restore();
    }

    // --- DYNAMIC DIRECTION ARROW ---
    if (!isMenu) {
        ctx.save();
        const arrowDist = len/2 + 35;
        ctx.translate(arrowDist, 0);
        const arrowPulse = 1 + Math.sin(time * 0.015) * 0.2;
        ctx.scale(arrowPulse, arrowPulse);
        
        ctx.fillStyle = carStrokeColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = carStrokeColor;
        
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(15, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(4, 0);
        ctx.closePath();
        ctx.fill();
        
        // Add a second smaller chevron for speed effect
        if (Math.hypot(p.vx, p.vy) > 5) {
             ctx.fillStyle = 'rgba(255,255,255,0.5)';
             ctx.beginPath();
             ctx.moveTo(20, -6);
             ctx.lineTo(30, 0);
             ctx.lineTo(20, 6);
             ctx.lineTo(24, 0);
             ctx.closePath();
             ctx.fill();
        }
        
        ctx.restore();
    }

    // --- FLOATING TURRET RENDER (Cinematic Weaponry) ---
    ctx.save(); 
    // Turret Rotation relative to car body
    ctx.rotate(p.turretAngle - p.angle); 
    
    // Recoil Logic: Move turret BACK based on flash timer
    const recoil = p.muzzleFlashTimer > 0 ? Math.min(8, p.muzzleFlashTimer * 2.0) : 0;
    ctx.translate(-recoil, 0);

    // 1. Floating Shadow (Enhanced for height illusion)
    ctx.save();
    ctx.translate(4, 4); // Shadow offset
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); 
    if (stats.name === "TITAN") ctx.rect(-10, -10, 40, 20);
    else ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // 2. Turret Mount / Swivel Base
    const accentColor = skin.glowColor;
    ctx.fillStyle = '#1a1a1a'; 
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; 
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    
    // Tech details on base
    ctx.strokeStyle = accentColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
    
    // Center Pivot
    ctx.fillStyle = '#050505';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();
    
    // 3. Weapon Systems (Detailed & Serious)
    const wColor = '#222';
    
    if (stats.name === "VOLTAGE" || stats.name === "NOVA") { 
        // RAILGUN: Twin Prongs with Energy Core
        ctx.fillStyle = '#181818';
        // Main Housing
        ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, -8); ctx.lineTo(10, 8); ctx.lineTo(-10, 12); ctx.fill();
        
        // Rails
        ctx.fillStyle = '#111';
        ctx.fillRect(10, -14, 35, 6); // Top Rail
        ctx.fillRect(10, 8, 35, 6);   // Bottom Rail
        
        // Energy Core (Glowing)
        ctx.shadowColor = accentColor; ctx.shadowBlur = 15;
        ctx.fillStyle = accentColor;
        ctx.fillRect(5, -3, 35, 6); // Center Beam
        ctx.shadowBlur = 0;
        
        // Capacitors
        ctx.fillStyle = '#444';
        ctx.fillRect(15, -15, 6, 8); ctx.fillRect(28, -15, 6, 8);
        ctx.fillRect(15, 7, 6, 8);   ctx.fillRect(28, 7, 6, 8);

    } else if (stats.name === "TITAN") {
        // HEAVY CANNON: Boxy, Industrial, Twin Barrel
        ctx.fillStyle = '#151515';
        // Main Turret Block
        ctx.fillRect(-12, -14, 35, 28);
        ctx.strokeStyle = '#444'; ctx.strokeRect(-12, -14, 35, 28);
        
        // Twin Barrels
        ctx.fillStyle = '#080808';
        ctx.fillRect(23, -10, 30, 8);
        ctx.fillRect(23, 2, 30, 8);
        
        // Muzzle Brakes
        ctx.fillStyle = '#333';
        ctx.fillRect(53, -12, 8, 12);
        ctx.fillRect(53, 0, 8, 12);

        // CHARGE GLOW EFFECT
        if (p.chargeLevel > 0) {
            const chargeRatio = p.chargeLevel / 100;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.shadowBlur = 15 * chargeRatio;
            ctx.shadowColor = accentColor;
            
            const glowAlpha = Math.floor(chargeRatio * 180).toString(16).padStart(2, '0');
            ctx.fillStyle = addAlphaToColor(accentColor, glowAlpha);
            
            // Glow on barrels
            ctx.fillRect(23, -10, 30, 8);
            ctx.fillRect(23, 2, 30, 8);
            
            // Core charging orb
            ctx.beginPath();
            ctx.arc(10, 0, 12 * chargeRatio, 0, Math.PI * 2);
            ctx.fill();
            
            // Energy arcs
            if (chargeRatio > 0.5) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for(let i=0; i<3; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const r = 15 * chargeRatio;
                    ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
                    ctx.lineTo(Math.cos(ang + 0.5) * (r + 5), Math.sin(ang + 0.5) * (r + 5));
                }
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Ammo Belt Feed (Visual)
        ctx.fillStyle = '#332200';
        ctx.fillRect(-8, 14, 12, 6);

    } else if (stats.name === "EAGLE") {
        // SNIPER: Long, Sleek, Scoped
        ctx.fillStyle = '#111';
        // Long Barrel
        ctx.fillRect(0, -3, 70, 6); 
        
        // Scope (Offset)
        ctx.fillStyle = '#000';
        ctx.fillRect(5, -12, 25, 6);
        ctx.strokeStyle = accentColor; ctx.lineWidth = 1;
        ctx.strokeRect(5, -12, 25, 6); // Scope Lens
        
        // Silencer / Suppressor
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(70, -5, 20, 10); 
        // Vents on silencer
        ctx.fillStyle = '#000';
        ctx.fillRect(74, -5, 2, 10); ctx.fillRect(80, -5, 2, 10); ctx.fillRect(86, -5, 2, 10);

    } else if (stats.name === "REI DO INFERNO") {
        // FLAMETHROWER: Demonic Dragon Head
        ctx.fillStyle = '#1a0500';
        
        // Base neck
        ctx.beginPath();
        ctx.moveTo(-10, -8); ctx.lineTo(15, -6); ctx.lineTo(15, 6); ctx.lineTo(-10, 8);
        ctx.fill();
        
        // Dragon Skull / Snout
        ctx.fillStyle = '#2a0a00';
        ctx.beginPath();
        ctx.moveTo(15, -8); ctx.lineTo(40, -4); ctx.lineTo(45, 0); ctx.lineTo(40, 4); ctx.lineTo(15, 8);
        ctx.fill();
        
        // Glowing Eyes
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.ellipse(25, -4, 4, 2, Math.PI/6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(25, 4, 4, 2, -Math.PI/6, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        // Horns
        ctx.strokeStyle = '#110000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, -6); ctx.quadraticCurveTo(0, -15, -5, -12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, 6); ctx.quadraticCurveTo(0, 15, -5, 12); ctx.stroke();
        
        // Open Maw (Muzzle)
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.moveTo(40, -2); ctx.lineTo(30, 0); ctx.lineTo(40, 2); ctx.fill();

    } else if (stats.name === "PHANTOM") {
        // STEALTH: Angular, Tech
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(-5, -8); ctx.lineTo(40, -3); ctx.lineTo(40, 3); ctx.lineTo(-5, 8);
        ctx.fill();
        
        // Glowing Strip
        ctx.fillStyle = accentColor;
        ctx.shadowColor = accentColor; ctx.shadowBlur = 8;
        ctx.fillRect(15, -1, 25, 2);
        ctx.shadowBlur = 0;

    } else { 
        // STANDARD: Modern Assault Cannon
        ctx.fillStyle = '#222';
        // Receiver
        ctx.fillRect(-8, -8, 25, 16);
        
        // Barrel with heat shield holes
        ctx.fillStyle = '#111';
        ctx.fillRect(17, -5, 30, 10);
        
        // Vents
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(22, 0, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(28, 0, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(34, 0, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 0, 2, 0, Math.PI*2); ctx.fill();
        
        // Muzzle
        ctx.fillStyle = '#000';
        ctx.fillRect(47, -6, 6, 12);
    }
    
    // 4. Energy Indicator (Rear of turret)
    // Shows ammo status or just cool tech light
    const ammoPct = p.ammo / p.maxAmmo;
    const lightColor = ammoPct > 0.2 ? accentColor : '#ff0000';
    
    ctx.fillStyle = lightColor;
    ctx.shadowColor = lightColor; ctx.shadowBlur = 5;
    ctx.fillRect(-8, -2, 4, 4);
    ctx.shadowBlur = 0;

    // Turret Top Detail (Center Pin)
    ctx.fillStyle = carStrokeColor;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
    
    // Glow Ring on Turret
    ctx.strokeStyle = carStrokeColor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.stroke();

    // Muzzle Flash (Improved Flame & Smoke)
    if (p.muzzleFlashTimer > 0) { 
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.9;
        
        let flashX = 30;
        let flashScale = 1;
        let coreColor = skin.projectileColor?.core || '#ffffff';
        let glowColor = skin.glowColor;

        if (stats.name === 'EAGLE') { flashX = 70; flashScale = 2; }
        else if (stats.name === 'TITAN') { flashX = 55; flashScale = 1.8; coreColor = '#ffaa00'; }
        else if (stats.name === 'VOLTAGE' || stats.name === 'NOVA') { flashX = 40; flashScale = 1.2; }
        else if (stats.name === 'REI DO INFERNO') { flashX = 45; flashScale = 2.0; coreColor = '#ffaa00'; glowColor = '#ff2200'; }
        else { flashX = 50; flashScale = 1.2; }

        const progress = p.muzzleFlashTimer / 4; // 1 to 0
        
        ctx.save();
        ctx.translate(flashX, 0);
        
        // Dynamic Flame Shape
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.moveTo(0, -5 * flashScale * progress);
        ctx.lineTo(20 * flashScale * progress, 0);
        ctx.lineTo(0, 5 * flashScale * progress);
        ctx.lineTo(-5 * flashScale, 0);
        ctx.fill();

        // Secondary Flame Burst
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.6 * progress;
        ctx.beginPath();
        ctx.moveTo(5 * flashScale, -8 * flashScale * progress);
        ctx.lineTo(35 * flashScale * progress, 0);
        ctx.lineTo(5 * flashScale, 8 * flashScale * progress);
        ctx.lineTo(-2 * flashScale, 0);
        ctx.fill();
        
        // Starburst effect for certain weapons
        if (stats.name === 'EAGLE' || stats.name === 'TITAN') {
            ctx.globalAlpha = 0.8 * progress;
            ctx.beginPath();
            ctx.moveTo(0, -25 * flashScale * progress); ctx.lineTo(0, 25 * flashScale * progress);
            ctx.moveTo(-10 * flashScale * progress, 0); ctx.lineTo(40 * flashScale * progress, 0);
            ctx.strokeStyle = coreColor; ctx.lineWidth = 2 * progress; ctx.stroke();
        }
        
        ctx.restore();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.restore(); ctx.restore(); ctx.restore(); ctx.restore();
  };
  
  return (
    <div className="relative w-full h-full select-none" style={{ touchAction: 'none' }}>
        {!hasInteracted && (
            <div className="absolute inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={() => { setHasInteracted(true); audioService.playUIClick(); }}>
                <div className="text-center animate-pulse">
                    <h1 className="text-4xl md:text-6xl font-black text-cyan-400 tracking-widest mb-4" style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.8)' }}>NEON ARENA</h1>
                    <p className="text-xl text-white/80 tracking-[0.2em]">CLICK TO INITIALIZE AUDIO</p>
                </div>
            </div>
        )}
        <canvas ref={canvasRef} onMouseDown={handleCanvasTouchStart} onMouseMove={handleMenuDragMove} onMouseUp={handleMenuDragEnd} onTouchStart={handleCanvasTouchStart} onTouchMove={handleMenuDragMove} onTouchEnd={handleMenuDragEnd} className="block w-full h-full" />
        
        {/* REACT UI LAYERS (Only interactive when NOT playing or PAUSED) */}
        {!isPlaying && activeTab === 'GARAGE' && !showModeSelect && !isVisualizing && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                
                {/* OVERVIEW UI Elements (Visible initially) */}
                {menuView === 'OVERVIEW' && (
                    <>
                        {/* TEAMS / SQUAD SLOTS UI */}
                        {menuView === 'OVERVIEW' && !isCustomizing && !showModeSelect && !isVisualizing && teammates.length > 0 && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
                                {teammates.map((tm, i) => {
                                    // Dynamic positioning matching drawMenu
                                    const width = window.innerWidth;
                                    let teamScaleModifier = 1.0;
                                    if (width < 768) {
                                        teamScaleModifier = teammates.length === 1 ? 0.7 : (teammates.length === 2 ? 0.6 : 0.5);
                                    } else {
                                        teamScaleModifier = teammates.length === 1 ? 0.85 : (teammates.length === 2 ? 0.75 : 0.65);
                                    }
                                    
                                    const spacing = 300 * teamScaleModifier; // Increased from 220 to 300
                                    let groupOffsetX = 0;
                                    
                                    if (teammates.length === 1) groupOffsetX = -spacing / 2;
                                    else if (teammates.length === 2) groupOffsetX = 0;
                                    else if (teammates.length === 3) groupOffsetX = -spacing / 2;

                                    let tmOffsetX = 0;
                                    if (teammates.length === 1) tmOffsetX = spacing;
                                    else if (teammates.length === 2) tmOffsetX = (i === 0 ? -spacing : spacing);
                                    else if (teammates.length === 3) {
                                        if (i === 0) tmOffsetX = -spacing;
                                        if (i === 1) tmOffsetX = spacing;
                                        if (i === 2) tmOffsetX = spacing * 2;
                                    }
                                    
                                    const finalX = groupOffsetX + tmOffsetX;

                                    return (
                                        <div 
                                            key={i} 
                                            className="absolute top-1/2 left-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-auto transition-all duration-300"
                                            style={{ marginLeft: finalX, marginTop: 50 * teamScaleModifier }} 
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                        >
                                            {tm ? (
                                                <div className="relative group">
                                                    {/* Teammate Info */}
                                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-center w-32">
                                                        <div className="text-[10px] font-bold text-cyan-400 tracking-widest uppercase mb-1">{tm.isBot ? 'BOT' : 'PLAYER'}</div>
                                                        <div className="text-sm font-black text-white bg-black/60 px-2 py-1 rounded border border-cyan-500/30 truncate">{tm.name}</div>
                                                    </div>
                                                    
                                                    {/* Remove Button (X) */}
                                                    <button 
                                                        onClick={() => {
                                                            setTeammates(prev => {
                                                                const newArr = [...prev];
                                                                newArr[i] = null;
                                                                return newArr;
                                                            });
                                                        }}
                                                        className="absolute -top-4 -right-4 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity border border-white/20 hover:scale-110"
                                                    >
                                                        X
                                                    </button>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => { setActiveInviteSlot(i); setInviteModalOpen(true); }}
                                                    className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center bg-black/20 hover:bg-cyan-500/10 hover:border-cyan-500 hover:scale-110 transition-all group backdrop-blur-sm"
                                                >
                                                    <span className="text-2xl text-white/50 group-hover:text-cyan-400 font-light">+</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* INVITE MODAL */}
                        {inviteModalOpen && (
                            <div 
                                className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 pointer-events-auto"
                                onPointerDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                            >
                                <div className="bg-gray-900 border border-cyan-500/30 p-6 rounded-lg max-w-sm w-full shadow-[0_0_50px_rgba(0,255,255,0.1)] relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
                                    
                                    <h3 className="text-xl font-black text-white mb-6 tracking-widest text-center">INVITE ALLY</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Player ID / Name</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    value={inviteInput}
                                                    onChange={(e) => setInviteInput(e.target.value)}
                                                    placeholder="ENTER ID..."
                                                    className="bg-black/50 border border-gray-700 text-white px-3 py-2 rounded flex-1 outline-none focus:border-cyan-500 font-mono text-sm"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        if (!inviteInput.trim()) return;
                                                        // Simulate Invite
                                                        setTeammates(prev => {
                                                            const newArr = [...prev];
                                                            if (activeInviteSlot !== null) {
                                                                newArr[activeInviteSlot] = {
                                                                    name: inviteInput.toUpperCase().slice(0, 10),
                                                                    carIndex: Math.floor(Math.random() * CAR_TYPES.length),
                                                                    skinIndex: Math.floor(Math.random() * SKINS.length),
                                                                    isBot: false, // Simulated player
                                                                    id: `P-${Math.random().toString(36).substr(2, 5)}`
                                                                };
                                                            }
                                                            return newArr;
                                                        });
                                                        setInviteModalOpen(false);
                                                        setInviteInput("");
                                                    }}
                                                    className="bg-cyan-900/50 hover:bg-cyan-600 text-cyan-400 hover:text-white px-4 py-2 rounded font-bold text-xs border border-cyan-500/30 transition-colors"
                                                >
                                                    INVITE
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="relative flex items-center justify-center my-4">
                                            <div className="absolute w-full h-[1px] bg-gray-800"></div>
                                            <span className="bg-gray-900 px-2 text-[10px] text-gray-500 relative z-10">OR</span>
                                        </div>
                                        
                                        <button 
                                            onClick={() => {
                                                setTeammates(prev => {
                                                    const newArr = [...prev];
                                                    if (activeInviteSlot !== null) {
                                                        const bName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                                                        newArr[activeInviteSlot] = {
                                                            name: bName,
                                                            carIndex: Math.floor(Math.random() * CAR_TYPES.length),
                                                            skinIndex: Math.floor(Math.random() * SKINS.length),
                                                            isBot: true,
                                                            id: `BOT-${Math.random().toString(36).substr(2, 5)}`
                                                        };
                                                    }
                                                    return newArr;
                                                });
                                                setInviteModalOpen(false);
                                            }}
                                            className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded font-bold text-sm border border-gray-700 hover:border-gray-500 transition-all flex items-center justify-center gap-2 group"
                                        >
                                            <span className="text-yellow-500 group-hover:scale-110 transition-transform">🤖</span> ADD AI BOT
                                        </button>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setInviteModalOpen(false)}
                                        className="mt-6 w-full text-xs text-gray-500 hover:text-white py-2"
                                    >
                                        CANCEL
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* TOP BAR */}
                        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none z-10">
                            {/* Player Identity & Settings */}
                            <div className="pointer-events-auto flex items-start gap-4">
                                <div className="flex flex-col gap-1">
                                    <div className="text-[10px] text-cyan-500 font-bold tracking-widest uppercase">{t.DRIVER}</div>
                                    <input 
                                       type="text" 
                                       value={playerName} 
                                       onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 10))}
                                       className="bg-transparent border-b border-cyan-500/50 text-white font-black text-2xl outline-none w-48 placeholder-gray-700 focus:border-cyan-400 transition-colors"
                                    />
                                </div>
                                <button 
                                    onClick={() => setShowSettings(true)}
                                    className="p-2 bg-black/40 border border-white/10 hover:border-cyan-500/50 rounded-sm transition-all group backdrop-blur-sm mt-1"
                                    title={t.SETTINGS}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-cyan-400 group-hover:rotate-90 transition-all duration-300">
                                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>

                            {/* Stats Display */}
                            <div className="flex gap-4">
                                <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-sm transform skew-x-[-10deg]">
                                    <div className="transform skew-x-[10deg] text-right">
                                        <div className="text-[10px] text-yellow-500 font-bold tracking-wider">{t.CREDITS}</div>
                                        <div className="text-xl text-white font-mono font-bold">{userProfile.currency} <span className="text-sm text-yellow-500">CR</span></div>
                                    </div>
                                </div>
                                <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-sm transform skew-x-[-10deg]">
                                    <div className="transform skew-x-[10deg] text-right">
                                        <div className="text-[10px] text-red-500 font-bold tracking-wider">{t.KILLS}</div>
                                        <div className="text-xl text-white font-mono font-bold">{userProfile.totalKills}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SETTINGS MODAL */}
                        {showSettings && (
                            <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto">
                                <div className="bg-gray-900 border border-cyan-500/50 p-8 rounded-xl max-w-md w-full shadow-[0_0_50px_rgba(0,255,255,0.1)] relative">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
                                    
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="text-2xl font-black text-white tracking-widest">{t.SETTINGS}</h2>
                                        <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Player Info */}
                                        <div className="bg-black/50 p-4 rounded border border-gray-800">
                                            <div className="mb-4">
                                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t.PLAYER_ID}</div>
                                                <div className="text-cyan-400 font-mono text-sm select-all">{userProfile.id}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t.PLAYER_NAME}</div>
                                                <input 
                                                    type="text" 
                                                    value={playerName} 
                                                    onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 10))}
                                                    className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded outline-none focus:border-cyan-500 font-mono text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Language Selection */}
                                        <div>
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t.LANGUAGE}</div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setLanguage('PT')}
                                                    className={`flex-1 py-3 rounded font-bold text-sm border transition-all ${language === 'PT' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                                >
                                                    PORTUGUÊS
                                                </button>
                                                <button 
                                                    onClick={() => setLanguage('EN')}
                                                    className={`flex-1 py-3 rounded font-bold text-sm border transition-all ${language === 'EN' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                                >
                                                    ENGLISH
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => setShowSettings(false)}
                                        className="w-full mt-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-black tracking-widest transition-colors shadow-[0_0_15px_rgba(0,255,255,0.3)]"
                                    >
                                        {t.CLOSE}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VISUALIZE TOGGLE */}
                        <button 
                             onClick={() => setIsVisualizing(true)}
                             className="absolute top-24 right-4 pointer-events-auto bg-black/20 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 p-3 rounded-full transition-all backdrop-blur-sm group"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-cyan-400"><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z"/></svg>
                        </button>

                        {/* CENTER HINT */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-24 pointer-events-none opacity-50 animate-pulse">
                            <div className="text-cyan-500/50 text-[10px] tracking-[0.3em] font-bold border border-cyan-500/30 px-4 py-1 rounded-full bg-black/20 backdrop-blur-sm">
                                {t.TAP_CAR_TO_TUNE}
                            </div>
                        </div>

                        {/* BOTTOM ACTION AREA */}
                        <div className="absolute bottom-0 w-full pointer-events-none">
                            
                            {/* Action Buttons Row */}
                            <div className="flex justify-between items-end px-6 pb-4 w-full max-w-7xl mx-auto">
                                <div className="flex gap-4">
                                    {/* Mode Selector */}
                                    <button 
                                        onClick={() => { setShowModeSelect(true); audioService.playUIClick(); }}
                                        className="pointer-events-auto group relative"
                                    >
                                        <div className="absolute inset-0 bg-cyan-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                        <div className="relative bg-black/60 border border-white/10 backdrop-blur-md px-6 py-4 rounded-sm transform skew-x-[-10deg] group-hover:border-cyan-500/50 transition-all">
                                            <div className="transform skew-x-[10deg] text-left">
                                                <div className="text-[10px] text-gray-400 group-hover:text-cyan-400 tracking-widest mb-1">{t.OPERATION}</div>
                                                <div className="text-2xl font-black text-white tracking-widest">{selectedGameMode}</div>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Multiplayer Lobby Button */}
                                    <button 
                                        onClick={() => { setShowMultiplayerLobby(true); multiplayerService.getRooms(setRooms); audioService.playUIClick(); }}
                                        className="pointer-events-auto group relative"
                                    >
                                        <div className="absolute inset-0 bg-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                        <div className="relative bg-black/60 border border-white/10 backdrop-blur-md px-6 py-4 rounded-sm transform skew-x-[-10deg] group-hover:border-purple-500/50 transition-all">
                                            <div className="transform skew-x-[10deg] text-left">
                                                <div className="text-[10px] text-gray-400 group-hover:text-purple-400 tracking-widest mb-1">{t.NETWORK}</div>
                                                <div className="text-2xl font-black text-white tracking-widest">{t.MULTIPLAYER}</div>
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {/* Deploy Button */}
                                {userProfile.ownedCars.includes(selectedCarType) ? (
                                    <button 
                                        onClick={() => { startGame(selectedGameMode); audioService.playUIClick(); }}
                                        className="pointer-events-auto group relative"
                                    >
                                        <div className="absolute inset-0 bg-green-500/30 blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
                                        <div className="relative bg-gradient-to-r from-green-600 to-emerald-600 px-12 py-5 transform skew-x-[-10deg] border-t border-white/20 shadow-lg group-hover:scale-105 transition-transform duration-200">
                                            <div className="transform skew-x-[10deg] text-black font-black text-3xl tracking-[0.15em]">
                                                {t.DEPLOY}
                                            </div>
                                        </div>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => { buyCar(selectedCarType); audioService.playUIUpgrade(); }}
                                        className="pointer-events-auto group relative"
                                    >
                                        <div className="absolute inset-0 bg-yellow-500/30 blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
                                        <div className="relative bg-gradient-to-r from-yellow-600 to-orange-600 px-10 py-5 transform skew-x-[-10deg] border-t border-white/20 shadow-lg group-hover:scale-105 transition-transform duration-200">
                                            <div className="transform skew-x-[10deg] text-black font-black text-xl tracking-[0.1em] flex flex-col items-center leading-tight">
                                                <span>{t.UNLOCK}</span>
                                                <span className="text-sm opacity-80">{getCarStats(selectedCarType).price} CR</span>
                                            </div>
                                        </div>
                                    </button>
                                )}
                            </div>

                            {/* Car Carousel Deck */}
                            <div className="w-full bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-6 px-4 pointer-events-auto overflow-x-auto no-scrollbar">
                                <div className="flex justify-center gap-8 min-w-max px-4">
                                    {(['COMMON', 'EPIC', 'LEGENDARY'] as Rarity[]).map(rarity => (
                                        <div key={rarity} className="flex flex-col gap-2">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">{rarity}</div>
                                            <div className="flex gap-4">
                                                {CAR_TYPES
                                                    .map((car, i) => ({ ...car, originalIndex: i }))
                                                    .filter(car => car.rarity === rarity)
                                                    .sort((a, b) => a.price - b.price)
                                                    .map((car) => {
                                                        const i = car.originalIndex;
                                                        const owned = userProfile.ownedCars.includes(i);
                                                        const selected = selectedCarType === i;
                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={() => { setSelectedCarType(i); audioService.playUISelect(); }}
                                                                className={`relative group transition-all duration-300 ${selected ? 'scale-110 z-10' : 'scale-95 opacity-60 hover:opacity-100'}`}
                                                            >
                                                                <div className={`
                                                                    w-32 h-20 rounded-lg border flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-md
                                                                    ${selected ? 'bg-cyan-900/20 border-cyan-500 shadow-[0_0_20px_rgba(0,255,255,0.2)]' : 'bg-gray-900/40 border-gray-700 hover:border-gray-500'}
                                                                `}>
                                                                    {/* Rarity Stripe */}
                                                                    <div className={`absolute top-0 left-0 w-1 h-full ${car.rarity === 'LEGENDARY' ? 'bg-yellow-500' : (car.rarity === 'EPIC' ? 'bg-purple-500' : 'bg-gray-500')}`}></div>
                                                                    
                                                                    <div className={`text-xs font-bold tracking-widest mb-1 text-center px-2 ${selected ? 'text-white' : 'text-gray-400'}`}>{car.name}</div>
                                                                    
                                                                    {!owned && (
                                                                        <div className="text-[10px] text-yellow-500 font-mono bg-black/60 px-2 py-0.5 rounded border border-yellow-500/30">
                                                                            {car.price} CR
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {selected && <div className="absolute bottom-0 w-full h-0.5 bg-cyan-500 animate-pulse"></div>}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* DETAIL / TUNING VIEW Elements (Visible after clicking car) */}
                {menuView === 'DETAIL' && (
                    <>
                         {/* Back Button */}
                         <button onClick={() => { setMenuView('OVERVIEW'); audioService.playUIBack(); }} className="absolute top-4 left-4 pointer-events-auto bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 font-bold z-50 flex items-center gap-2">
                            <span className="text-cyan-400">&lt;</span> BACK
                        </button>

                        {/* BOTTOM PANEL CONTAINER */}
                        <div className="absolute bottom-0 left-0 w-full h-[45vh] bg-black/80 backdrop-blur-md border-t border-cyan-500/30 flex flex-col pointer-events-auto animate-slide-up">
                            
                            {/* TABS */}
                            <div className="flex w-full border-b border-gray-700">
                                <button 
                                    onClick={() => { setTuningTab('UPGRADES'); audioService.playUIClick(); }}
                                    className={`flex-1 py-3 font-bold text-sm tracking-widest transition-colors ${tuningTab === 'UPGRADES' ? 'bg-cyan-900/40 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    PERFORMANCE
                                </button>
                                <button 
                                    onClick={() => { setTuningTab('SKINS'); audioService.playUIClick(); }}
                                    className={`flex-1 py-3 font-bold text-sm tracking-widest transition-colors ${tuningTab === 'SKINS' ? 'bg-purple-900/40 text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    PAINT JOB
                                </button>
                            </div>

                            {/* CONTENT AREA */}
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                                
                                {/* UPGRADES TAB */}
                                {tuningTab === 'UPGRADES' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                                        {['speed', 'health', 'damage', 'fireRate', 'nitroSpeed', 'ammo', 'radarRange'].map((stat) => {
                                             const s = stat as keyof CarUpgradeState;
                                             const lvl = (userProfile.upgrades[selectedCarType] || { speed: 0, health: 0, damage: 0, fireRate: 0, nitroSpeed: 0, ammo: 0, radarRange: 0 })[s] || 0;
                                             const cost = 500 * (lvl + 1);
                                             return (
                                                 <div key={stat} className="bg-gray-900/50 p-3 rounded border border-gray-700 flex items-center gap-4">
                                                     <div className="flex-1">
                                                         <div className="flex justify-between text-xs text-gray-400 mb-1 uppercase font-bold">
                                                             <span>{stat === 'nitroSpeed' ? 'Nitro Boost' : stat === 'radarRange' ? 'Radar Range' : stat === 'ammo' ? 'Ammo Capacity' : stat}</span>
                                                             <span className="text-cyan-400">Lvl {lvl}</span>
                                                         </div>
                                                         <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
                                                             <div className="h-full bg-cyan-500" style={{ width: `${(lvl/10)*100}%` }}></div>
                                                         </div>
                                                     </div>
                                                     <div className="flex flex-col gap-1 w-24">
                                                         <button onClick={() => { upgradeCar(s, 1); audioService.playUIUpgrade(); }} className={`w-full text-[10px] py-2 rounded font-bold ${userProfile.currency >= cost && lvl < 10 ? 'bg-cyan-700 text-white hover:bg-cyan-600' : 'bg-gray-800 text-gray-500'}`}>
                                                            UP {cost}
                                                         </button>
                                                     </div>
                                                 </div>
                                             );
                                        })}
                                    </div>
                                )}

                                {/* SKINS TAB */}
                                {tuningTab === 'SKINS' && (
                                    <div className="flex flex-col items-center">
                                        <div className="grid grid-cols-5 md:grid-cols-8 gap-3 mb-6">
                                            {SKINS.map((skin, i) => {
                                                const owned = userProfile.ownedSkins.includes(skin.id);
                                                return (
                                                    <button 
                                                        key={skin.id}
                                                        onClick={() => { setSelectedSkinIndex(i); audioService.playUISelect(); }}
                                                        className={`w-12 h-12 md:w-16 md:h-16 rounded-lg border-2 transition-all flex items-center justify-center relative group
                                                            ${selectedSkinIndex === i ? 'border-white scale-110 shadow-[0_0_15px_white] z-10' : 'border-gray-700 opacity-70 hover:opacity-100 hover:border-gray-500'}
                                                        `}
                                                        style={{ background: `linear-gradient(135deg, ${skin.colors[0]}, ${skin.colors[1] || skin.colors[0]})` }}
                                                    >
                                                        {!owned && <span className="text-xs drop-shadow-md">🔒</span>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        
                                        {/* Skin Purchase/Equip Action */}
                                        <div className="w-full max-w-md bg-gray-900/80 p-4 rounded-lg border border-gray-700 flex flex-col items-center gap-3">
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-white tracking-wider">{getSkin(selectedSkinIndex).name}</div>
                                                <div className={`text-[10px] font-bold tracking-widest`} style={{ color: RARITY_COLORS[getSkin(selectedSkinIndex).rarity] }}>
                                                    {getSkin(selectedSkinIndex).rarity}
                                                </div>
                                            </div>
                                            
                                            {!userProfile.ownedSkins.includes(getSkin(selectedSkinIndex).id) ? (
                                                <button 
                                                    onClick={() => { buySkin(selectedSkinIndex); audioService.playUIUpgrade(); }}
                                                    className={`w-full py-3 rounded font-black tracking-widest transition-all ${userProfile.currency >= getSkin(selectedSkinIndex).price ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                                >
                                                    UNLOCK FOR {getSkin(selectedSkinIndex).price} CR
                                                </button>
                                            ) : (
                                                <div className="text-green-500 font-bold flex items-center gap-2 text-sm">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                     SKIN OWNED & EQUIPPED
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* VISUALIZE MODE OVERLAY (Click to exit) */}
        {!isPlaying && isVisualizing && (
            <div 
                className="absolute top-0 left-0 w-full h-full z-50 cursor-pointer"
                onClick={() => setIsVisualizing(false)}
            >
                <div className="absolute bottom-10 w-full text-center text-white/30 text-sm font-mono animate-pulse pointer-events-none">
                    TAP ANYWHERE TO EXIT
                </div>
            </div>
        )}

        {/* MULTIPLAYER LOBBY OVERLAY */}
        {!isPlaying && showMultiplayerLobby && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl pointer-events-auto">
                <div className="w-full max-w-4xl p-8 bg-gray-900/80 border border-cyan-500/30 rounded-xl shadow-2xl">
                    <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                        <h2 className="text-3xl font-black text-cyan-400 tracking-widest">MULTIPLAYER NETWORK</h2>
                        <button onClick={() => setShowMultiplayerLobby(false)} className="text-gray-400 hover:text-white font-bold">CLOSE [X]</button>
                    </div>

                    {!currentRoom ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Create Room */}
                            <div className="bg-black/50 p-6 rounded-lg border border-gray-800">
                                <h3 className="text-xl font-bold text-white mb-4">CREATE ROOM</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">ROOM NAME</label>
                                        <input type="text" value={createRoomData.name} onChange={e => setCreateRoomData({...createRoomData, name: e.target.value})} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700 focus:border-cyan-500 outline-none" placeholder="My Awesome Room" />
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500 block mb-1">MAX PLAYERS</label>
                                            <input type="number" min="2" max="20" value={createRoomData.maxPlayers} onChange={e => setCreateRoomData({...createRoomData, maxPlayers: parseInt(e.target.value)})} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700 focus:border-cyan-500 outline-none" />
                                        </div>
                                        <div className="flex items-end pb-2">
                                            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                                <input type="checkbox" checked={createRoomData.isPrivate} onChange={e => setCreateRoomData({...createRoomData, isPrivate: e.target.checked})} className="accent-cyan-500" />
                                                PRIVATE
                                            </label>
                                        </div>
                                    </div>
                                    {createRoomData.isPrivate && (
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">PASSWORD</label>
                                            <input type="password" value={createRoomData.password} onChange={e => setCreateRoomData({...createRoomData, password: e.target.value})} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700 focus:border-cyan-500 outline-none" />
                                        </div>
                                    )}
                                    <button 
                                        onClick={() => {
                                            multiplayerService.createRoom({ ...createRoomData, playerName, carType: selectedCarType, skinIndex: selectedSkinIndex }, (res) => {
                                                if (res.success) setCurrentRoom(res.room);
                                            });
                                        }}
                                        className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded tracking-widest mt-4"
                                    >
                                        CREATE & JOIN
                                    </button>
                                </div>
                            </div>

                            {/* Join Room */}
                            <div className="bg-black/50 p-6 rounded-lg border border-gray-800 flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-white">PUBLIC ROOMS</h3>
                                    <button onClick={() => multiplayerService.getRooms(setRooms)} className="text-xs text-cyan-500 hover:text-cyan-400">REFRESH</button>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar max-h-[300px]">
                                    {rooms.length === 0 ? (
                                        <div className="text-center text-gray-600 py-8 text-sm">NO PUBLIC ROOMS FOUND</div>
                                    ) : (
                                        rooms.map(room => (
                                            <div key={room.id} className="bg-gray-800 p-3 rounded border border-gray-700 flex justify-between items-center">
                                                <div>
                                                    <div className="font-bold text-white">{room.name}</div>
                                                    <div className="text-xs text-gray-400">{room.players.length} / {room.maxPlayers} PLAYERS</div>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        multiplayerService.joinRoom({ roomId: room.id, playerName, carType: selectedCarType, skinIndex: selectedSkinIndex }, (res) => {
                                                            if (res.success) setCurrentRoom(res.room);
                                                            else alert(res.message);
                                                        });
                                                    }}
                                                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded"
                                                >
                                                    JOIN
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                                
                                <div className="mt-4 pt-4 border-t border-gray-800">
                                    <h4 className="text-sm font-bold text-gray-400 mb-2">JOIN PRIVATE ROOM</h4>
                                    <div className="flex gap-2">
                                        <input type="text" id="joinRoomId" placeholder="ROOM ID" className="flex-1 bg-gray-800 text-white p-2 rounded border border-gray-700 text-sm outline-none" />
                                        <input type="password" id="joinRoomPwd" placeholder="PASSWORD" className="flex-1 bg-gray-800 text-white p-2 rounded border border-gray-700 text-sm outline-none" />
                                        <button 
                                            onClick={() => {
                                                const id = (document.getElementById('joinRoomId') as HTMLInputElement).value;
                                                const pwd = (document.getElementById('joinRoomPwd') as HTMLInputElement).value;
                                                if(id) {
                                                    multiplayerService.joinRoom({ roomId: id, password: pwd, playerName, carType: selectedCarType, skinIndex: selectedSkinIndex }, (res) => {
                                                        if (res.success) setCurrentRoom(res.room);
                                                        else alert(res.message);
                                                    });
                                                }
                                            }}
                                            className="px-4 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded"
                                        >
                                            JOIN
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Room Lobby */
                        <div className="flex flex-col h-[500px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{currentRoom.name}</h3>
                                    <div className="text-sm text-gray-400 font-mono">ID: <span className="text-cyan-400 select-all">{currentRoom.id}</span> {currentRoom.isPrivate && '🔒'}</div>
                                </div>
                                <button 
                                    onClick={() => { multiplayerService.leaveRoom(); setCurrentRoom(null); }}
                                    className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-400 rounded border border-red-900"
                                >
                                    LEAVE ROOM
                                </button>
                            </div>
                            
                            <div className="flex-1 bg-black/50 rounded-lg border border-gray-800 p-4 overflow-y-auto mb-6">
                                <div className="grid grid-cols-12 gap-4 mb-2 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    <div className="col-span-6">PLAYER</div>
                                    <div className="col-span-4">VEHICLE</div>
                                    <div className="col-span-2 text-right">STATUS</div>
                                </div>
                                <div className="space-y-2">
                                    {currentRoom.players.map((p: any) => (
                                        <div key={p.id} className={`grid grid-cols-12 gap-4 items-center p-3 rounded border ${p.id === multiplayerService.socketId ? 'bg-cyan-900/20 border-cyan-500/50' : 'bg-gray-800 border-gray-700'}`}>
                                            <div className="col-span-6 flex items-center gap-2">
                                                {p.isHost && <span className="text-yellow-500 text-xs" title="Host">👑</span>}
                                                <span className="font-bold text-white">{p.name}</span>
                                                {p.id === multiplayerService.socketId && <span className="text-[10px] bg-cyan-500 text-black px-1 rounded font-black">YOU</span>}
                                            </div>
                                            <div className="col-span-4 text-xs text-gray-400">
                                                {getCarStats(p.carType).name}
                                            </div>
                                            <div className="col-span-2 text-right">
                                                {p.isReady ? <span className="text-green-500 font-bold text-xs">READY</span> : <span className="text-gray-500 font-bold text-xs">WAITING</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-4">
                                <button 
                                    onClick={() => multiplayerService.toggleReady()}
                                    className={`px-8 py-3 rounded font-bold tracking-widest transition-colors ${currentRoom.players.find((p:any) => p.id === multiplayerService.socketId)?.isReady ? 'bg-gray-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                                >
                                    {currentRoom.players.find((p:any) => p.id === multiplayerService.socketId)?.isReady ? 'UNREADY' : 'READY UP'}
                                </button>
                                
                                {currentRoom.hostId === multiplayerService.socketId && (
                                    <button 
                                        onClick={() => multiplayerService.startGame()}
                                        disabled={!currentRoom.players.every((p:any) => p.isReady)}
                                        className={`px-8 py-3 rounded font-bold tracking-widest ${currentRoom.players.every((p:any) => p.isReady) ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                                    >
                                        START MATCH
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* LOADING SCREEN OVERLAY */}
        {isLoading && (
            <div className="absolute inset-0 bg-black z-[100] flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl px-8">
                    <div className="flex justify-between items-end mb-2">
                        <div className="text-cyan-500 font-mono text-xs tracking-widest animate-pulse">{loadingText}</div>
                        <div className="text-white font-black text-4xl">{Math.floor(loadingProgress)}%</div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden relative">
                        <div 
                            className="h-full bg-cyan-500 shadow-[0_0_20px_#00ffff]" 
                            style={{ width: `${loadingProgress}%`, transition: 'width 0.1s linear' }}
                        ></div>
                        <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-20"></div>
                    </div>

                    {/* Tips Section */}
                    <div className="mt-12 border-l-2 border-cyan-500/30 pl-4">
                        <div className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">TACTICAL INTEL</div>
                        <div className="text-gray-300 font-mono text-sm">
                            {(() => {
                                const tips = [
                                    "Drifting fills your Nitro gauge faster.",
                                    "Collect blue orbs to upgrade your weapon power.",
                                    "Stay close to teammates to cover blind spots.",
                                    "Shields regenerate after avoiding damage for a while.",
                                    "Different cars have unique handling characteristics."
                                ];
                                // Use a deterministic tip based on time or just random
                                return tips[Math.floor((Date.now() / 5000) % tips.length)];
                            })()}
                        </div>
                    </div>
                </div>
                
                {/* Background Grid Animation */}
                <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                    backgroundImage: 'linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    transform: `perspective(500px) rotateX(60deg) translateY(${loadingProgress * 2}px)`
                }}></div>
            </div>
        )}

        {/* HUD LAYOUT CUSTOMIZER OVERLAY */}
        {isCustomizing && (
            <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 z-50 touch-none">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black px-4 py-2 border border-cyan-500 text-cyan-500 font-bold">
                    {t.DRAG_TO_REPOSITION}
                </div>
                <button onPointerDown={(e) => handleDragStart('driveStick', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onTouchStart={(e) => handleDragStart('driveStick', e)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} className="absolute w-36 h-36 border-2 border-dashed border-cyan-500 rounded-full flex items-center justify-center bg-cyan-500 bg-opacity-10 text-cyan-500 font-bold" style={{ left: layout.driveStick.x, top: layout.driveStick.y, touchAction: 'none' }}>{t.MOVE}</button>
                <button onPointerDown={(e) => handleDragStart('fireStick', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onTouchStart={(e) => handleDragStart('fireStick', e)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} className="absolute w-36 h-36 border-2 border-dashed border-red-500 rounded-full flex items-center justify-center bg-red-500 bg-opacity-10 text-red-500 font-bold" style={{ left: layout.fireStick.x, top: layout.fireStick.y, touchAction: 'none' }}>{t.AIM}</button>
                <button onPointerDown={(e) => handleDragStart('boostBtn', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onTouchStart={(e) => handleDragStart('boostBtn', e)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} className="absolute w-16 h-16 border-2 border-dashed border-yellow-500 rounded-full flex items-center justify-center bg-yellow-500 bg-opacity-10 text-yellow-500 text-xs" style={{ left: layout.boostBtn.x, top: layout.boostBtn.y, touchAction: 'none' }}>{t.BOOST}</button>
                <button onPointerDown={(e) => handleDragStart('ability1Btn', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onTouchStart={(e) => handleDragStart('ability1Btn', e)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} className="absolute w-16 h-16 border-2 border-dashed border-green-500 rounded-full flex items-center justify-center bg-green-500 bg-opacity-10 text-green-500 text-xs" style={{ left: layout.ability1Btn.x, top: layout.ability1Btn.y, touchAction: 'none' }}>{t.ABIL_1}</button>
                <button onPointerDown={(e) => handleDragStart('ability2Btn', e)} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onTouchStart={(e) => handleDragStart('ability2Btn', e)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} className="absolute w-16 h-16 border-2 border-dashed border-orange-500 rounded-full flex items-center justify-center bg-orange-500 bg-opacity-10 text-orange-500 text-xs" style={{ left: layout.ability2Btn.x, top: layout.ability2Btn.y, touchAction: 'none' }}>{t.ABIL_2}</button>
                <div className="absolute bottom-10 w-full flex justify-center gap-4">
                     <button onClick={resetLayout} className="bg-red-900 px-6 py-2 rounded text-white font-bold border border-red-500">{t.RESET}</button>
                     <button onClick={saveLayout} className="bg-green-900 px-6 py-2 rounded text-white font-bold border border-green-500">{t.SAVE_CLOSE}</button>
                </div>
            </div>
        )}

        {/* IN-GAME REACT HUD LAYER */}
        {isPlaying && !isPaused && !isSpectating && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <VirtualJoystick onMove={handleMoveJoystick} color="cyan" style={{ left: layout.driveStick.x, top: layout.driveStick.y }} className="pointer-events-auto" />
                <VirtualJoystick onMove={handleAimJoystick} color="red" style={{ left: layout.fireStick.x, top: layout.fireStick.y }} className="pointer-events-auto" />
                
                {/* Action Buttons using Custom Layout */}
                <button 
                    onPointerDown={() => toggleBoost(true)} onPointerUp={() => toggleBoost(false)} onPointerLeave={() => toggleBoost(false)}
                    onTouchStart={() => toggleBoost(true)} onTouchEnd={() => toggleBoost(false)}
                    className="absolute w-16 h-16 rounded-full pointer-events-auto opacity-0"
                    style={{ left: layout.boostBtn.x, top: layout.boostBtn.y }}
                >
                    <span className="text-[10px] font-bold text-yellow-400 absolute bottom-1 w-full text-center">{t.NITRO}</span>
                </button>

                {/* Squad Status (For team modes) */}
                <div className="absolute top-60 left-4 flex flex-col gap-2">
                    {squadStatus.map(s => (
                        <div key={s.id} className="flex items-center gap-2 bg-black bg-opacity-40 p-1 px-2 rounded border-l-2 border-cyan-500">
                            <div className={`w-2 h-2 rounded-full ${s.isDead ? 'bg-red-500' : 'bg-green-500'} shadow-[0_0_5px_rgba(0,255,0,0.5)]`} />
                            <span className="text-[10px] font-bold text-white w-16 truncate uppercase tracking-tighter">{s.name}</span>
                            <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 transition-all duration-300" style={{width: `${(s.health/s.maxHealth)*100}%`}}/>
                            </div>
                            <span className="text-[10px] font-bold text-yellow-400 ml-1">💀 {s.totalKills || 0}</span>
                        </div>
                    ))}
                </div>
                
                {showLeaderboard && (
                    <div className="absolute top-4 right-4 w-48 bg-black bg-opacity-60 rounded border border-gray-800 p-2 pointer-events-auto" onClick={() => setShowLeaderboard(false)}>
                        <div className="text-xs text-gray-400 mb-1 border-b border-gray-700 pb-1">{t.LEADERBOARD}</div>
                        {leaderboardData.slice(0, 5).map((e, i) => (
                            <div key={e.id} className={`flex justify-between text-xs mb-1 ${e.id === 'player' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
                                <span>{i+1}. {e.name?.slice(0,8)}</span>
                                <span>{Math.floor(e.score)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {!showLeaderboard && (
                    <button onClick={() => setShowLeaderboard(true)} className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs p-1 px-2 border border-gray-700 pointer-events-auto">
                        {t.TOP_5}
                    </button>
                )}

                <button 
                    onClick={() => setIsPaused(true)}
                    className="absolute top-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white text-xs px-3 py-1 border border-gray-700 rounded pointer-events-auto"
                >
                    {t.PAUSE}
                </button>

                {/* Match Stats (Alive / Kills) */}
                <div className="absolute top-12 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
                    <div className="bg-black/60 border border-cyan-500/30 px-4 py-1 flex items-center gap-2 backdrop-blur-sm skew-x-[-10deg]">
                        <span className="text-cyan-500 text-[10px] font-mono uppercase skew-x-[10deg]">{t.ALIVE}</span>
                        <span className="text-white font-black text-lg skew-x-[10deg]">
                            {1 + (state.current?.bots.filter(b => !b.isDead).length || 0)}
                        </span>
                    </div>
                    <div className="bg-black/60 border border-red-500/30 px-4 py-1 flex items-center gap-2 backdrop-blur-sm skew-x-[-10deg]">
                        <span className="text-red-500 text-[10px] font-mono uppercase skew-x-[10deg]">{t.KILLS}</span>
                        <span className="text-white font-black text-lg skew-x-[10deg]">
                            {state.current?.player.totalKills || 0}
                        </span>
                    </div>
                </div>
            </div>
        )}

        {/* SPECTATOR OVERLAY */}
        {isPlaying && !isPaused && isSpectating && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col items-center">
                <div className="mt-10 bg-black/60 px-6 py-2 border-l-4 border-cyan-500 backdrop-blur-sm flex flex-col items-center">
                    <div className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">{t.SPECTATING}</div>
                    <div className="text-2xl font-black text-white tracking-tight">
                        {[state.current.player, ...state.current.bots].find(c => c.id === state.current.camera.spectateTargetId)?.name || "UNKNOWN"}
                    </div>
                    
                    <div className="flex gap-4 mt-2 pointer-events-auto">
                        <button 
                            onClick={handleLike}
                            className="flex items-center gap-1 bg-green-600/40 hover:bg-green-600/60 text-white text-xs px-3 py-1 rounded border border-green-500/50 transition-all active:scale-95"
                        >
                            👍 {t.LIKE}
                        </button>
                        <button 
                            onClick={handleDislike}
                            className="flex items-center gap-1 bg-red-600/40 hover:bg-red-600/60 text-white text-xs px-3 py-1 rounded border border-red-500/50 transition-all active:scale-95"
                        >
                            👎 {t.DISLIKE}
                        </button>
                    </div>
                </div>
                
                <button 
                    onClick={() => setIsPaused(true)}
                    className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs px-3 py-1 border border-gray-700 rounded pointer-events-auto"
                >
                    {t.PAUSE}
                </button>
            </div>
        )}

        {/* PAUSE MENU */}
        {isPaused && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden">
                {/* Cinematic Background */}
                <div className="absolute inset-0 bg-black/80 backdrop-blur-lg"></div>
                <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-10"></div>
                
                {/* Decorative Tech Lines */}
                <div className="absolute top-0 left-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent"></div>
                <div className="absolute top-0 right-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent"></div>

                <div className="relative z-10 flex flex-col items-center animate-fade-in-up">
                    <div className="relative mb-16">
                        <h2 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-[0.3em] italic skew-x-[-10deg] drop-shadow-[0_0_30px_rgba(0,255,255,0.4)]">
                            {t.SYSTEM_PAUSED}
                        </h2>
                        <div className="absolute -inset-6 border-y border-cyan-500/30 skew-x-[-10deg] pointer-events-none">
                            <div className="absolute top-0 left-0 w-16 h-[1px] bg-cyan-400"></div>
                            <div className="absolute bottom-0 right-0 w-16 h-[1px] bg-cyan-400"></div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6 w-80">
                        <button 
                            onClick={() => setIsPaused(false)} 
                            className="group relative overflow-hidden py-5 bg-cyan-500 text-black font-black text-xl tracking-widest skew-x-[-10deg] transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_40px_rgba(0,255,255,0.6)]"
                        >
                            <span className="relative z-10">{t.RESUME_COMBAT}</span>
                            <div className="absolute inset-0 bg-white translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out"></div>
                        </button>

                        <button 
                            onClick={() => {setIsCustomizing(true); setIsPaused(false);}} 
                            className="group relative overflow-hidden py-5 bg-black/50 border border-cyan-500/30 text-cyan-400 font-black text-xl tracking-widest skew-x-[-10deg] transition-all hover:border-cyan-400 hover:scale-105 active:scale-95 backdrop-blur-sm"
                        >
                            <span className="relative z-10 group-hover:text-black transition-colors duration-300">{t.CONFIGURE_HUD}</span>
                            <div className="absolute inset-0 bg-cyan-400 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                        </button>

                        {!showExitConfirm ? (
                             <button 
                                onClick={() => setShowExitConfirm(true)} 
                                className="group relative overflow-hidden py-5 bg-red-950/40 border border-red-500/30 text-red-500 font-black text-xl tracking-widest skew-x-[-10deg] transition-all hover:bg-red-600 hover:text-white hover:border-red-500 hover:scale-105 active:scale-95 backdrop-blur-sm mt-8"
                             >
                                <span className="relative z-10">{t.ABORT_MISSION}</span>
                                <div className="absolute inset-0 bg-red-600 translate-x-[100%] group-hover:translate-x-0 transition-transform duration-300 ease-out"></div>
                             </button>
                        ) : (
                             <div className="flex flex-col gap-3 mt-8 p-4 bg-red-950/40 border border-red-500/50 skew-x-[-10deg] backdrop-blur-md animate-pulse">
                                 <div className="text-red-400 text-sm font-bold text-center uppercase tracking-widest">{t.CONFIRM_ABORT}</div>
                                 <div className="flex gap-3">
                                     <button onClick={handleConfirmExit} className="flex-1 py-3 bg-red-600 text-white font-black hover:bg-red-500 transition-colors shadow-[0_0_15px_rgba(255,0,0,0.5)]">{t.YES}</button>
                                     <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-3 bg-gray-800 text-white font-black hover:bg-gray-700 transition-colors">{t.NO}</button>
                                 </div>
                             </div>
                        )}
                    </div>

                    <div className="mt-20 flex gap-12 text-xs text-cyan-500/50 font-mono tracking-[0.4em] uppercase">
                        <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> UPLINK SECURE</span>
                        <span>LATENCY: 12ms</span>
                        <span>BUILD: 2.4.0-RC</span>
                    </div>
                </div>
            </div>
        )}

        {/* GAME OVER SCREEN */}
        {isGameOver && (
             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl animate-in fade-in duration-700 pointer-events-auto">
                 {/* Header */}
                 <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-center border-b border-white/10">
                     <h2 className="text-4xl font-black tracking-[0.2em] text-white uppercase">
                         {matchResult === 'VICTORY' ? t.VICTORY : t.DEFEAT}
                     </h2>
                 </div>

                 {/* Leaderboard Panel */}
                 <div className="w-full max-w-4xl bg-black/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-10 duration-1000">
                     <div className="p-8">
                         {selectedGameMode === 'SOLO' ? (
                             (() => {
                                 const playerEntry = leaderboard.find(e => e.isPlayer);
                                 if (!playerEntry) return null;
                                 return (
                                     <div className="flex flex-col items-center justify-center py-10 gap-8 animate-in zoom-in-95 duration-500">
                                         <div className="text-cyan-400 text-sm font-bold tracking-[0.4em] uppercase">{t.MISSION_REPORT}</div>
                                         <div className="flex flex-col items-center">
                                             <div className="text-gray-500 text-xs font-bold uppercase mb-2 tracking-widest">{t.TOTAL_SCORE}</div>
                                             <div className="text-8xl font-black text-white tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                                 {playerEntry.score.toLocaleString()}
                                             </div>
                                         </div>
                                         <div className="grid grid-cols-2 gap-12 w-full max-w-lg">
                                             <div className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                                                 <div className="text-gray-500 text-xs font-bold uppercase mb-2 tracking-widest">{t.ELIMINATIONS}</div>
                                                 <div className="text-4xl font-black text-white">{playerEntry.kills}</div>
                                             </div>
                                             <div className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                                                 <div className="text-gray-500 text-xs font-bold uppercase mb-2 tracking-widest">{t.ENERGY_COLLECTED}</div>
                                                 <div className="text-4xl font-black text-white">{playerEntry.energy}</div>
                                             </div>
                                         </div>
                                     </div>
                                 );
                             })()
                         ) : (
                             <>
                                 <div className="grid grid-cols-12 gap-4 mb-6 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                     <div className="col-span-1">#</div>
                                     <div className="col-span-5">{t.PILOT}</div>
                                     <div className="col-span-2 text-center">{t.SCORE}</div>
                                     <div className="col-span-2 text-center">{t.ELIMINATIONS}</div>
                                     <div className="col-span-2 text-center">{t.ENERGY}</div>
                                 </div>

                                 <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                     {leaderboard.map((entry, index) => {
                                         const isMVP = index === 0 && matchResult === 'VICTORY';
                                         return (
                                             <div 
                                                 key={index}
                                                 className={`grid grid-cols-12 gap-4 items-center p-4 rounded-xl transition-all duration-300 ${
                                                     isMVP 
                                                     ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/50 scale-[1.02] shadow-[0_0_30px_rgba(234,179,8,0.2)]' 
                                                     : entry.isPlayer 
                                                         ? 'bg-white/10 border border-white/20' 
                                                         : 'bg-white/5 border border-white/5'
                                                 }`}
                                             >
                                                 <div className={`col-span-1 font-black text-xl ${isMVP ? 'text-yellow-500' : 'text-gray-500'}`}>
                                                     {index + 1}
                                                 </div>
                                                 <div className="col-span-5 flex items-center gap-4">
                                                     <div className={`w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center border ${isMVP ? 'border-yellow-500' : 'border-white/10'}`}>
                                                         <div className="w-6 h-6 opacity-50">
                                                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                                                                 <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h10c.6 0 1.1-.2 1.5-.5.4.3.9.5 1.5.5ZM7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
                                                             </svg>
                                                         </div>
                                                     </div>
                                                     <div>
                                                         <div className="font-bold text-white flex items-center gap-2">
                                                             {entry.name}
                                                             {entry.isPlayer && <span className="text-[10px] bg-cyan-500 text-black px-1 rounded font-black">{t.YOU}</span>}
                                                             {isMVP && <span className="text-[10px] bg-yellow-500 text-black px-1 rounded font-black">MVP</span>}
                                                         </div>
                                                         <div className="text-[10px] text-gray-500 uppercase font-bold">
                                                             {getCarStats(entry.carType).name}
                                                         </div>
                                                     </div>
                                                 </div>
                                                 <div className="col-span-2 text-center font-black text-white">
                                                     {entry.score.toLocaleString()}
                                                 </div>
                                                 <div className="col-span-2 text-center flex items-center justify-center gap-2 text-gray-300">
                                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-50">
                                                         <circle cx="12" cy="12" r="10" />
                                                         <line x1="22" y1="12" x2="18" y2="12" />
                                                         <line x1="6" y1="12" x2="2" y2="12" />
                                                         <line x1="12" y1="6" x2="12" y2="2" />
                                                         <line x1="12" y1="22" x2="12" y2="18" />
                                                     </svg>
                                                     <span className="font-bold">{entry.kills}</span>
                                                 </div>
                                                 <div className="col-span-2 text-center flex items-center justify-center gap-2 text-gray-300">
                                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-yellow-500 opacity-80">
                                                         <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                                     </svg>
                                                     <span className="font-bold">{entry.energy}</span>
                                                 </div>
                                             </div>
                                         );
                                     })}
                                 </div>
                             </>
                         )}
                     </div>
                 </div>

                 {/* Footer Actions */}
                 <div className="mt-12 flex flex-wrap justify-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
                     <button 
                         onClick={() => startGame(selectedGameMode)}
                         className="group relative px-12 py-4 bg-white text-black font-black text-lg rounded-xl hover:scale-105 transition-all shadow-xl active:scale-95 overflow-hidden"
                     >
                         <span className="relative z-10">{t.PLAY_AGAIN}</span>
                         <div className="absolute inset-0 bg-cyan-400 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300"></div>
                     </button>
                     <button 
                         onClick={returnToMenu}
                         className="px-12 py-4 bg-white/10 text-white font-black text-lg rounded-xl border border-white/10 hover:bg-white/20 transition-all active:scale-95"
                     >
                         {t.BACK_TO_MENU}
                     </button>
                     <button 
                         onClick={() => {
                            if (navigator.share) {
                                navigator.share({
                                    title: 'Neon Drift Arena',
                                    text: `Acabei de conseguir uma VITÓRIA no Neon Drift Arena! Pontuação: ${leaderboard.find(e => e.isPlayer)?.score}`,
                                    url: window.location.href
                                }).catch(() => {});
                            } else {
                                alert("Compartilhamento não suportado neste navegador.");
                            }
                         }}
                         className="px-8 py-4 bg-cyan-500/20 text-cyan-400 font-black text-lg rounded-xl border border-cyan-500/30 hover:bg-cyan-500/30 transition-all active:scale-95 flex items-center gap-2"
                     >
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                             <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                             <polyline points="16 6 12 2 8 6" />
                             <line x1="12" y1="2" x2="12" y2="15" />
                         </svg>
                         {t.SHARE}
                     </button>
                 </div>
             </div>
        )}
        {/* MULTIPLAYER LOBBY UI */}
        {showMultiplayerLobby && (
            <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fade-in">
                <div className="w-full max-w-4xl bg-gray-900/80 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 p-4 border-b border-cyan-500/30 flex justify-between items-center">
                        <h2 className="text-2xl font-black text-white tracking-widest">{t.MULTIPLAYER} LOBBY</h2>
                        <button 
                            onClick={() => {
                                setShowMultiplayerLobby(false);
                                multiplayerService.disconnect();
                            }}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {currentRoom ? (
                            // Inside a Room
                            <div className="flex-1 flex flex-col p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-3xl font-black text-cyan-400">{currentRoom.name}</h3>
                                        <div className="text-sm text-gray-400">ID: {currentRoom.id} • {currentRoom.isPrivate ? t.PRIVATE_ROOM : 'Public'}</div>
                                    </div>
                                    <div className="text-xl font-bold text-gray-300">
                                        {currentRoom.players.length} / {currentRoom.maxPlayers} {t.PLAYER}S
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto bg-black/40 rounded-lg border border-gray-800 p-4 mb-6">
                                    {currentRoom.players.map((p: any) => (
                                        <div key={p.id} className={`flex justify-between items-center p-3 mb-2 rounded border ${p.id === (multiplayerService as any).socket?.id ? 'bg-cyan-900/20 border-cyan-500/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-xs font-bold">
                                                    {p.teamId}
                                                </div>
                                                <span className="font-bold text-white text-lg">{p.name}</span>
                                                {p.isHost && <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded border border-yellow-500/30">{t.HOST}</span>}
                                            </div>
                                            <div className={`text-sm font-bold px-3 py-1 rounded ${p.isReady ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {p.isReady ? t.READY : t.NOT_READY}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => multiplayerService.leaveRoom()}
                                        className="px-6 py-3 bg-red-900/50 hover:bg-red-800 text-red-100 rounded font-bold transition-colors border border-red-500/30"
                                    >
                                        {t.LEAVE_ROOM}
                                    </button>
                                    <button 
                                        onClick={() => multiplayerService.toggleReady()}
                                        className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded font-bold transition-colors border border-gray-600"
                                    >
                                        {t.TOGGLE_READY}
                                    </button>
                                    {currentRoom.hostId === (multiplayerService as any).socket?.id && (
                                        <button 
                                            onClick={() => multiplayerService.startGame()}
                                            disabled={!currentRoom.players.every((p: any) => p.isReady || p.isHost)}
                                            className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-bold transition-colors shadow-[0_0_15px_rgba(0,255,255,0.3)] disabled:shadow-none"
                                        >
                                            {t.START_GAME}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            // Room List & Creation
                            <div className="flex-1 flex">
                                {/* Room List */}
                                <div className="flex-1 flex flex-col border-r border-gray-800 p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold text-white">{t.PUBLIC_ROOMS}</h3>
                                        <button onClick={() => multiplayerService.getRooms((r) => setRooms(r))} className="text-cyan-400 hover:text-cyan-300 text-sm">{t.REFRESH}</button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                        {rooms.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-gray-500 italic">No public rooms available</div>
                                        ) : (
                                            rooms.map(room => (
                                                <div key={room.id} className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 p-4 rounded mb-3 transition-colors flex justify-between items-center group">
                                                    <div>
                                                        <div className="font-bold text-white text-lg">{room.name}</div>
                                                        <div className="text-xs text-gray-400">{t.HOST}: {room.players.find((p:any) => p.isHost)?.name || 'Unknown'}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-sm font-mono text-cyan-400">{room.players.length}/{room.maxPlayers}</div>
                                                        <button 
                                                            onClick={() => multiplayerService.joinRoom({ roomId: room.id, playerName, carType: selectedCarType, skinIndex: selectedSkinIndex }, (res) => {
                                                                if (!res.success) alert(res.message);
                                                            })}
                                                            className="px-4 py-2 bg-cyan-900/50 hover:bg-cyan-600 text-cyan-100 rounded text-sm font-bold opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            {t.JOIN}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Create Room / Join Private */}
                                <div className="w-80 p-6 flex flex-col gap-6 bg-black/20">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">{t.CREATE_ROOM}</h3>
                                        <div className="flex flex-col gap-3">
                                            <input 
                                                type="text" 
                                                placeholder={t.ROOM_NAME}
                                                value={createRoomData.name}
                                                onChange={e => setCreateRoomData({...createRoomData, name: e.target.value})}
                                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                                            />
                                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={createRoomData.isPrivate}
                                                    onChange={e => setCreateRoomData({...createRoomData, isPrivate: e.target.checked})}
                                                    className="accent-cyan-500"
                                                />
                                                {t.PRIVATE_ROOM}
                                            </label>
                                            {createRoomData.isPrivate && (
                                                <input 
                                                    type="text" 
                                                    placeholder={t.PASSWORD}
                                                    value={createRoomData.password}
                                                    onChange={e => setCreateRoomData({...createRoomData, password: e.target.value})}
                                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                                                />
                                            )}
                                            <button 
                                                onClick={() => {
                                                    multiplayerService.createRoom({
                                                        ...createRoomData,
                                                        playerName,
                                                        carType: selectedCarType,
                                                        skinIndex: selectedSkinIndex
                                                    }, (res) => {
                                                        if (!res.success) alert(res.message);
                                                    });
                                                }}
                                                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold mt-2 transition-colors"
                                            >
                                                {t.CREATE}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">{t.JOIN_PRIVATE}</h3>
                                        <div className="flex flex-col gap-3">
                                            <input 
                                                type="text" 
                                                placeholder={t.ROOM_ID}
                                                id="joinRoomId"
                                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none uppercase"
                                            />
                                            <input 
                                                type="text" 
                                                placeholder={t.PASSWORD}
                                                id="joinRoomPassword"
                                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                                            />
                                            <button 
                                                onClick={() => {
                                                    const id = (document.getElementById('joinRoomId') as HTMLInputElement).value;
                                                    const pass = (document.getElementById('joinRoomPassword') as HTMLInputElement).value;
                                                    if (id) {
                                                        multiplayerService.joinRoom({ roomId: id, password: pass, playerName, carType: selectedCarType, skinIndex: selectedSkinIndex }, (res) => {
                                                            if (!res.success) alert(res.message);
                                                        });
                                                    }
                                                }}
                                                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold mt-2 transition-colors"
                                            >
                                                {t.JOIN}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};
