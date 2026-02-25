
import { CarStats } from '../components/NeonArena';

interface SoundInstance {
    osc: OscillatorNode[];
    noise?: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
    panner: StereoPannerNode;
}

class AudioService {
    private context: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private initialized = false;
    
    // Map to track looping sounds for entities
    private engineSounds: Map<string, SoundInstance> = new Map();
    private nitroSounds: Map<string, SoundInstance> = new Map();
    private skidSounds: Map<string, SoundInstance> = new Map();
    
    private currentZoom: number = 1.0;
    
    constructor() {
        // We initialize on first user interaction
    }

    public setCameraZoom(zoom: number) {
        this.currentZoom = zoom;
    }

    public init() {
        if (this.initialized) return;
        try {
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.4;
            
            this.initialized = true;
            console.log("Audio Service Initialized");
        } catch (e) {
            console.error("Failed to initialize AudioContext", e);
        }
    }

    private resume() {
        if (this.context?.state === 'suspended') {
            this.context.resume();
        }
    }

    private getSpatialParams(x: number, y: number, listenerX: number, listenerY: number, maxDist: number = 3000) {
        const dx = x - listenerX;
        const dy = y - listenerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > maxDist) return { volume: 0, pan: 0, filterFreq: 20000 };

        // Volume falloff
        let volume = Math.max(0, 1 - dist / maxDist);
        volume = Math.pow(volume, 1.5);

        // Panning
        const pan = Math.max(-1, Math.min(1, dx / 1000));

        // Muffling effect (low pass filter frequency)
        // Closer = higher freq (clearer), Farther = lower freq (muffled)
        let filterFreq = 200 + (1 - dist / maxDist) * 18000;

        // Apply zoom effect
        // Zoom out (e.g., 0.4) -> more muffled, lower volume
        // Zoom in (e.g., 1.5) -> clearer, higher volume
        volume *= Math.max(0.2, Math.min(1.5, this.currentZoom));
        
        filterFreq *= Math.max(0.1, Math.min(1.2, this.currentZoom));
        filterFreq = Math.max(200, Math.min(20000, filterFreq));

        return { volume, pan, filterFreq };
    }

    /**
     * Synthesizes a shooting sound based on car stats
     */
    public playShootSound(carStats: CarStats, isPlayer: boolean, x: number, y: number, listenerX: number, listenerY: number, chargeMultiplier: number = 1.0) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();

        const now = this.context.currentTime;
        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 4000);
        
        let finalVolume = isPlayer ? 1.0 : volume * 0.6;
        let finalFilterFreq = isPlayer ? 20000 : filterFreq;

        // Apply zoom to player sounds as well
        if (isPlayer) {
            finalFilterFreq *= Math.max(0.2, Math.min(1.0, this.currentZoom));
            finalFilterFreq = Math.max(500, Math.min(20000, finalFilterFreq));
            finalVolume *= Math.max(0.4, Math.min(1.2, this.currentZoom));
        }

        if (finalVolume <= 0.01) return;

        const panner = this.context.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(this.masterGain);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(finalFilterFreq, now);
        filter.connect(panner);

        const gainNode = this.context.createGain();
        gainNode.connect(filter);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(finalVolume, now + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        const carName = carStats.name;
        if (carName === "TITAN") {
            this.createHeavyShot(now, gainNode, chargeMultiplier);
        } else if (carName === "VOLTAGE") {
            this.createEnergyShot(now, gainNode, 1.2);
        } else if (carName === "NOVA") {
            this.createNovaShot(now, gainNode);
        } else if (carName === "EAGLE") {
            this.createSniperShot(now, gainNode);
        } else if (carName === "REI DO INFERNO") {
            this.createFlameShot(now, gainNode);
        } else {
            this.createStandardShot(now, gainNode, carStats.weight);
        }
    }

    private createStandardShot(now: number, destination: AudioNode, weight: number) {
        if (!this.context) return;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        
        // Smoother "thump" laser with low-pass filter
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600 / weight, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1000 / weight, now);
        osc2.frequency.exponentialRampToValueAtTime(80, now + 0.15);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4000, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.15);

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.7, now + 0.008); // Softer attack
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.15);
        osc2.stop(now + 0.15);

        // Add a very soft high-freq pop for definition
        this.createNoiseBurst(now, destination, 0.02, 0.15, 6000);
    }

    private createHeavyShot(now: number, destination: AudioNode, charge: number) {
        if (!this.context) return;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const sub = this.context.createOscillator();
        
        // Deep, cinematic plasma cannon
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180 * charge, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(90 * charge, now);
        osc2.frequency.exponentialRampToValueAtTime(20, now + 0.4);

        sub.type = 'sine';
        sub.frequency.setValueAtTime(60 * charge, now);
        sub.frequency.exponentialRampToValueAtTime(30, now + 0.5);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);
        filter.Q.value = 5;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1.0, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc.connect(filter);
        osc2.connect(filter);
        sub.connect(gain);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc2.start(now);
        sub.start(now);
        osc.stop(now + 0.5);
        osc2.stop(now + 0.5);
        sub.stop(now + 0.5);
        
        this.createNoiseBurst(now, destination, 0.3, 0.4, 800);
    }

    private createEnergyShot(now: number, destination: AudioNode, pitchMod: number) {
        if (!this.context) return;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        
        // Clean, high-tech pulse
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 * pitchMod, now);
        osc.frequency.exponentialRampToValueAtTime(400 * pitchMod, now + 0.15);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(2400 * pitchMod, now);
        osc2.frequency.exponentialRampToValueAtTime(800 * pitchMod, now + 0.15);

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.7, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.15);
        osc2.stop(now + 0.15);
    }

    private createNovaShot(now: number, destination: AudioNode) {
        if (!this.context) return;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        
        // Ethereal, resonant pulse
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1000, now);
        osc2.frequency.exponentialRampToValueAtTime(200, now + 0.2);

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.2);
        osc2.stop(now + 0.2);
    }

    private createSniperShot(now: number, destination: AudioNode) {
        if (!this.context) return;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        
        // Piercing but smooth railgun beam
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2500, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 0.25);

        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3500, now);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.25);
        filter.Q.value = 8;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1.0, now + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.3);
        osc2.stop(now + 0.3);
        
        this.createNoiseBurst(now, destination, 0.15, 0.5, 6000);
    }

    private createFlameShot(now: number, destination: AudioNode) {
        if (!this.context) return;
        // Sizzling but smooth plasma burst
        const osc = this.context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.25);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(150, now + 0.25);

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc.stop(now + 0.25);

        this.createNoiseBurst(now, destination, 0.3, 0.6, 2500);
    }

    private createNoiseBurst(now: number, destination: AudioNode, duration: number, volume: number, freq: number = 1000) {
        if (!this.context) return;
        const bufferSize = this.context.sampleRate * duration;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.context.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = this.context.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(freq, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(freq / 2, now + duration);
        const noiseGain = this.context.createGain();
        noiseGain.gain.setValueAtTime(volume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(destination);
        noise.start(now);
        noise.stop(now + duration);
    }

    public playExplosion(x: number, y: number, listenerX: number, listenerY: number, size: number = 1.0) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 6000);
        if (volume <= 0.01) return;

        const panner = this.context.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(this.masterGain);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, now);
        filter.connect(panner);

        const gainNode = this.context.createGain();
        gainNode.connect(filter);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume * 2.2, now + 0.015); // More punchy
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 3.0 * size);

        // Deep cinematic sub-bass boom
        const boom = this.context.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(70, now); // Lower freq for more sub
        boom.frequency.exponentialRampToValueAtTime(15, now + 1.5 * size);
        boom.connect(gainNode);
        boom.start(now);
        boom.stop(now + 1.5 * size);
        
        // Punchy, smooth impact
        const punch = this.context.createOscillator();
        punch.type = 'triangle';
        punch.frequency.setValueAtTime(140, now);
        punch.frequency.exponentialRampToValueAtTime(25, now + 0.5 * size);
        const punchGain = this.context.createGain();
        punchGain.gain.setValueAtTime(volume * 1.2, now);
        punchGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5 * size);
        punch.connect(punchGain);
        punchGain.connect(filter);
        punch.start(now);
        punch.stop(now + 0.5 * size);

        // Layered noise for texture
        this.createNoiseBurst(now, gainNode, 2.5 * size, volume * 1.2, 500); // Deeper rumble
        this.createNoiseBurst(now, gainNode, 1.0 * size, volume * 0.6, 2500); // Mid debris
    }

    public playImpactSound(x: number, y: number, listenerX: number, listenerY: number, intensity: number = 1.0, isCritical: boolean = false) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 3000);
        if (volume <= 0.01) return;

        const panner = this.context.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(this.masterGain);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, now);
        filter.connect(panner);

        const gainNode = this.context.createGain();
        gainNode.connect(filter);
        
        const finalVol = Math.min(2.5, volume * (isCritical ? 2.0 : 1.2) * intensity);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(finalVol, now + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isCritical ? 0.5 : 0.3));

        // Initial smooth punch
        const punch = this.context.createOscillator();
        punch.type = 'triangle';
        punch.frequency.setValueAtTime(isCritical ? 250 : 120, now);
        punch.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        punch.connect(gainNode);
        punch.start(now);
        punch.stop(now + 0.12);
        
        // Metallic resonant ring (softer)
        const osc2 = this.context.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(isCritical ? 2200 : 1100, now);
        osc2.frequency.exponentialRampToValueAtTime(isCritical ? 400 : 150, now + 0.25);
        osc2.connect(gainNode);
        osc2.start(now);
        osc2.stop(now + 0.25);

        // Soft texture noise
        if (isCritical) {
            this.createNoiseBurst(now, gainNode, 0.25, finalVol * 0.8, 4000);
        } else {
            this.createNoiseBurst(now, gainNode, 0.1, finalVol * 0.4, 1500);
        }
    }

    public updateEngineSound(id: string, carStats: CarStats, x: number, y: number, listenerX: number, listenerY: number, speed: number, isPlayer: boolean) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 2000);
        
        let baseVol = isPlayer ? 0.15 : volume * 0.08;
        if (isPlayer) baseVol *= Math.max(0.4, Math.min(1.2, this.currentZoom));
        const finalVolume = baseVol * (0.5 + (speed / 40) * 0.5);
        
        let instance = this.engineSounds.get(id);
        if (!instance) {
            const panner = this.context.createStereoPanner();
            panner.connect(this.masterGain);
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 8; // Higher resonance for a squelchy synth feel
            filter.connect(panner);
            const gain = this.context.createGain();
            gain.gain.value = 0;
            gain.connect(filter);
            
            const osc1 = this.context.createOscillator();
            const osc2 = this.context.createOscillator();
            osc1.type = 'square'; // Square wave for a retro/synth feel
            osc2.type = 'triangle'; // Triangle for sub-bass warmth
            osc1.connect(gain);
            osc2.connect(gain);
            osc1.start();
            osc2.start();
            
            instance = { osc: [osc1, osc2], gain, filter, panner };
            this.engineSounds.set(id, instance);
        }

        instance.panner.pan.setTargetAtTime(pan, now, 0.1);
        
        // Filter opens up drastically with speed for a satisfying synth sweep
        let engineFilterFreq = 200 + (speed / 40) * 3000;
        if (isPlayer) {
            engineFilterFreq *= Math.max(0.2, Math.min(1.0, this.currentZoom));
            engineFilterFreq = Math.max(200, Math.min(20000, engineFilterFreq));
        }
        instance.filter.frequency.setTargetAtTime(isPlayer ? engineFilterFreq : Math.min(engineFilterFreq, filterFreq), now, 0.1);
        
        instance.gain.gain.setTargetAtTime(finalVolume, now, 0.1);
        
        // Smooth, musical pitch scaling
        const baseFreq = 55; // A1
        const pitch = baseFreq + (speed / 40) * 110; // Sweeps up an octave
        instance.osc[0].frequency.setTargetAtTime(pitch, now, 0.1);
        instance.osc[1].frequency.setTargetAtTime(pitch / 2, now, 0.1); // Sub-octave
    }

    public updateNitroSound(id: string, x: number, y: number, listenerX: number, listenerY: number, isActive: boolean, isPlayer: boolean) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        const now = this.context.currentTime;
        let instance = this.nitroSounds.get(id);

        if (!isActive) {
            if (instance) {
                instance.gain.gain.setTargetAtTime(0, now, 0.2);
            }
            return;
        }

        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 3000);
        let finalVolume = isPlayer ? 0.25 : volume * 0.2;
        if (isPlayer) finalVolume *= Math.max(0.4, Math.min(1.2, this.currentZoom));

        if (!instance) {
            const panner = this.context.createStereoPanner();
            panner.connect(this.masterGain);
            const filter = this.context.createBiquadFilter();
            filter.type = 'bandpass';
            filter.connect(panner);
            const gain = this.context.createGain();
            gain.gain.value = 0;
            gain.connect(filter);

            const bufferSize = this.context.sampleRate * 2;
            const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.context.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(gain);
            noise.start();

            instance = { osc: [], noise, gain, filter, panner };
            this.nitroSounds.set(id, instance);
        }

        instance.panner.pan.setTargetAtTime(pan, now, 0.1);
        
        let nitroFilterFreq = isPlayer ? 800 : filterFreq * 0.1;
        if (isPlayer) {
            nitroFilterFreq *= Math.max(0.2, Math.min(1.0, this.currentZoom));
            nitroFilterFreq = Math.max(200, Math.min(20000, nitroFilterFreq));
        }
        instance.filter.frequency.setTargetAtTime(nitroFilterFreq, now, 0.1);
        instance.gain.gain.setTargetAtTime(finalVolume, now, 0.1);
    }

    public updateSkidSound(id: string, x: number, y: number, listenerX: number, listenerY: number, isActive: boolean, isPlayer: boolean) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        const now = this.context.currentTime;
        let instance = this.skidSounds.get(id);

        if (!isActive) {
            if (instance) instance.gain.gain.setTargetAtTime(0, now, 0.2);
            return;
        }

        const { volume, pan, filterFreq } = this.getSpatialParams(x, y, listenerX, listenerY, 1500);
        let finalVolume = isPlayer ? 0.15 : volume * 0.1;
        if (isPlayer) finalVolume *= Math.max(0.4, Math.min(1.2, this.currentZoom));

        if (!instance) {
            const panner = this.context.createStereoPanner();
            panner.connect(this.masterGain);
            const filter = this.context.createBiquadFilter();
            filter.type = 'highpass';
            filter.connect(panner);
            const gain = this.context.createGain();
            gain.gain.value = 0;
            gain.connect(filter);

            const bufferSize = this.context.sampleRate * 1;
            const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.context.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(gain);
            noise.start();

            instance = { osc: [], noise, gain, filter, panner };
            this.skidSounds.set(id, instance);
        }

        instance.panner.pan.setTargetAtTime(pan, now, 0.1);
        
        let skidFilterFreq = isPlayer ? 2000 : filterFreq;
        if (isPlayer) {
            skidFilterFreq *= Math.max(0.2, Math.min(1.0, this.currentZoom));
            skidFilterFreq = Math.max(500, Math.min(20000, skidFilterFreq));
        }
        instance.filter.frequency.setTargetAtTime(skidFilterFreq, now, 0.1);
        instance.gain.gain.setTargetAtTime(finalVolume, now, 0.1);
    }

    public stopAllEntitySounds(id: string) {
        [this.engineSounds, this.nitroSounds, this.skidSounds].forEach(map => {
            const instance = map.get(id);
            if (instance) {
                instance.gain.gain.setTargetAtTime(0, this.context!.currentTime, 0.1);
                // Stop oscillators after fade out to prevent memory leaks
                setTimeout(() => {
                    try {
                        instance.osc.forEach(o => o.stop());
                        if (instance.noise) instance.noise.stop();
                    } catch (e) {
                        // Ignore errors if already stopped
                    }
                }, 200);
                map.delete(id);
            }
        });
    }

    public stopAllSounds() {
        if (!this.initialized) return;
        const allIds = new Set<string>();
        this.engineSounds.forEach((_, id) => allIds.add(id));
        this.nitroSounds.forEach((_, id) => allIds.add(id));
        this.skidSounds.forEach((_, id) => allIds.add(id));
        
        allIds.forEach(id => this.stopAllEntitySounds(id));
        
        // Clear maps to fully reset
        this.engineSounds.clear();
        this.nitroSounds.clear();
        this.skidSounds.clear();
    }

    public playPickupSound(isMapOrb: boolean) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gainNode = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isMapOrb ? 440 : 880, now);
        osc.frequency.exponentialRampToValueAtTime(isMapOrb ? 880 : 1760, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    public playBeep(high: boolean = false) {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gainNode = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(high ? 880 : 440, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    public playKillSound() {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const gainNode = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(110, now);
        osc2.frequency.exponentialRampToValueAtTime(220, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.masterGain);
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.5);
        osc2.stop(now + 0.5);
    }

    public playUIClick() {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    public playUISelect() {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    public playUIUpgrade() {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        
        // Arpeggio for upgrade
        const freqs = [440, 554.37, 659.25, 880]; // A major
        freqs.forEach((f, i) => {
            const osc = this.context!.createOscillator();
            const gain = this.context!.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + i * 0.05);
            gain.gain.setValueAtTime(0, now + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.1, now + i * 0.05 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.2);
            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.2);
        });
    }

    public playUIBack() {
        if (!this.initialized || !this.context || !this.masterGain) return;
        this.resume();
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }
}

export const audioService = new AudioService();
