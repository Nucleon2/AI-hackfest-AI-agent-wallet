"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 1500;
const PARTICLE_RADIUS_MIN = 2.4;
const PARTICLE_RADIUS_MAX = 3.2;

export type OrbState = "idle" | "processing" | "confirmed" | "error";

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

  const particlePositions = useMemo(
    () => generateSphereParticles(PARTICLE_COUNT),
    []
  );

  const visual = ORB_VISUALS[state];

  useFrame((_, delta) => {
    const mult = visual.rotationMultiplier;
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
  });

  return (
    <group>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[1.4, 16]} />
        <MeshDistortMaterial
          color={visual.color}
          distort={visual.distort}
          speed={visual.speed}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
            count={PARTICLE_COUNT}
            array={particlePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
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
