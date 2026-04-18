"use client";

import * as React from "react";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";
import type { OrbState } from "@/lib/stores/orbStore";

const PARTICLE_COUNT = 1500;
const PARTICLE_RADIUS_MIN = 2.4;
const PARTICLE_RADIUS_MAX = 3.2;
const BURST_SCALE = 0.9;
const BURST_RAMP_UP = 1 / 0.6;
const BURST_RAMP_DOWN = 1 / 0.8;
const VISUAL_SMOOTHING = 6;

type DistortMaterial = THREE.MeshStandardMaterial & {
  distort: number;
  speed: number;
};

// OrbState is imported from lib/stores/orbStore — re-export for consumers that import from this file
export type { OrbState };

interface OrbVisual {
  color: string;
  distort: number;
  speed: number;
  rotationMultiplier: number;
  particleColor: string;
}

const ORB_VISUALS: Record<OrbState, OrbVisual> = {
  idle: {
    color: "#6366f1",
    distort: 0.35,
    speed: 1.5,
    rotationMultiplier: 1,
    particleColor: "#a5b4fc",
  },
  processing: {
    color: "#fbbf24",
    distort: 0.55,
    speed: 3.2,
    rotationMultiplier: 2.2,
    particleColor: "#fde68a",
  },
  confirmed: {
    color: "#34d399",
    distort: 0.6,
    speed: 2.4,
    rotationMultiplier: 1.4,
    particleColor: "#a7f3d0",
  },
  error: {
    color: "#ef4444",
    distort: 0.25,
    speed: 4,
    rotationMultiplier: 0.6,
    particleColor: "#fecaca",
  },
  scanning: {
    color: "#06b6d4",
    distort: 0.45,
    speed: 2.5,
    rotationMultiplier: 1.8,
    particleColor: "#67e8f9",
  },
};

function generateSphereParticles(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r =
      PARTICLE_RADIUS_MIN +
      Math.random() * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

interface WalletOrbProps {
  state?: OrbState;
}

export function WalletOrb({ state = "idle" }: WalletOrbProps) {
  const orbRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const pointsMaterialRef = useRef<THREE.PointsMaterial>(null);
  const distortMaterialRef = useRef<DistortMaterial>(null);

  const basePositions = useMemo(
    () => generateSphereParticles(PARTICLE_COUNT),
    []
  );
  const livePositions = useMemo(() => basePositions.slice(), [basePositions]);
  const burstProgress = useRef(0);
  const prevStateRef = useRef<OrbState>("idle");

  const idleVisual = ORB_VISUALS.idle;
  const currentDistort = useRef(idleVisual.distort);
  const currentSpeed = useRef(idleVisual.speed);
  const currentMult = useRef(idleVisual.rotationMultiplier);
  const targetOrbColor = useMemo(() => new THREE.Color(), []);
  const targetParticleColor = useMemo(() => new THREE.Color(), []);

  const visual = ORB_VISUALS[state];

  useFrame((_, delta) => {
    // Cleanup particle positions when exiting scanning state
    if (prevStateRef.current === "scanning" && state !== "scanning") {
      for (let i = 0; i < livePositions.length; i++) livePositions[i] = basePositions[i];
      if (particlesRef.current) {
        (particlesRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
    prevStateRef.current = state;

    const t = Math.min(1, delta * VISUAL_SMOOTHING);

    currentDistort.current += (visual.distort - currentDistort.current) * t;
    currentSpeed.current += (visual.speed - currentSpeed.current) * t;
    currentMult.current +=
      (visual.rotationMultiplier - currentMult.current) * t;

    if (distortMaterialRef.current) {
      distortMaterialRef.current.distort = currentDistort.current;
      distortMaterialRef.current.speed = currentSpeed.current;
      targetOrbColor.set(visual.color);
      distortMaterialRef.current.color.lerp(targetOrbColor, t);
    }
    if (pointsMaterialRef.current) {
      targetParticleColor.set(visual.particleColor);
      pointsMaterialRef.current.color.lerp(targetParticleColor, t);
    }

    const mult = currentMult.current;
    if (orbRef.current) {
      orbRef.current.rotation.y += delta * 0.15 * mult;
      orbRef.current.rotation.x += delta * 0.05 * mult;
      if (state === "error") {
        // tight tremor on x axis
        orbRef.current.rotation.x += Math.sin(performance.now() * 0.04) * 0.002;
      }
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y -= delta * 0.04 * mult;
      particlesRef.current.rotation.x += delta * 0.02 * mult;
    }

    const target = state === "confirmed" ? 1 : 0;
    const rampRate = state === "confirmed" ? BURST_RAMP_UP : BURST_RAMP_DOWN;
    if (burstProgress.current !== target) {
      const step = delta * rampRate;
      burstProgress.current =
        target > burstProgress.current
          ? Math.min(target, burstProgress.current + step)
          : Math.max(target, burstProgress.current - step);
      const eased = 1 - Math.pow(1 - burstProgress.current, 3);
      const scale = 1 + eased * BURST_SCALE;
      for (let i = 0; i < livePositions.length; i++) {
        livePositions[i] = basePositions[i] * scale;
      }
      if (particlesRef.current) {
        const attr = particlesRef.current.geometry.attributes
          .position as THREE.BufferAttribute;
        attr.needsUpdate = true;
      }
      if (pointsMaterialRef.current) {
        pointsMaterialRef.current.opacity = 0.8 - eased * 0.5;
      }
    }

    // Scanning state: vertical particle sweep wave
    if (state === "scanning" && particlesRef.current) {
      const now = performance.now() * 0.001;
      const attr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base_y = basePositions[i * 3 + 1];
        const sweepPhase = ((base_y / PARTICLE_RADIUS_MAX + 1) * 0.5 - (now * 0.4 % 1)) * Math.PI * 4;
        livePositions[i * 3 + 1] = base_y + Math.sin(sweepPhase) * 0.18;
      }
      attr.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[1.4, 16]} />
        <MeshDistortMaterial
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={distortMaterialRef as unknown as React.Ref<any>}
          color={idleVisual.color}
          distort={idleVisual.distort}
          speed={idleVisual.speed}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[livePositions, 3]}
            count={PARTICLE_COUNT}
            array={livePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMaterialRef}
          size={0.02}
          color={visual.particleColor}
          transparent
          opacity={0.8}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
